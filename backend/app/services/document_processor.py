"""Conservative medical-document extraction with source traceability.

Rule-based extraction is deliberately incomplete: uncertain fields remain null and
are flagged for human review. This is information extraction, not diagnosis.
"""
from __future__ import annotations

import io
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import PurePath
from typing import Any

from PIL import Image, UnidentifiedImageError

ALLOWED_MIME_TYPES = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
}
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024
MIN_TEXT_CHARS_PER_PAGE = 20


class DocumentValidationError(ValueError):
    pass


def validate_document(filename: str, content_type: str | None, content: bytes) -> str:
    """Validate extension, MIME type, and size; never trust the client MIME alone."""
    suffix = PurePath(filename or "").suffix.lower()
    if len(content) == 0:
        raise DocumentValidationError("The uploaded file is empty.")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise DocumentValidationError("File exceeds the 15 MiB upload limit.")
    if not suffix or not any(suffix in suffixes for suffixes in ALLOWED_MIME_TYPES.values()):
        raise DocumentValidationError("Only PDF, JPG/JPEG, and PNG documents are supported.")
    expected_mime = next((mime for mime, suffixes in ALLOWED_MIME_TYPES.items() if suffix in suffixes), None)
    if content_type and content_type not in {expected_mime, "application/octet-stream"}:
        raise DocumentValidationError("The file extension and content type do not match.")
    if expected_mime == "application/pdf" and not content.startswith(b"%PDF-"):
        raise DocumentValidationError("The uploaded file does not have a valid PDF signature.")
    if expected_mime.startswith("image/"):
        try:
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
        except (UnidentifiedImageError, OSError):
            raise DocumentValidationError("The uploaded image is invalid or unreadable.") from None
    return expected_mime


@dataclass
class ExtractedEntity:
    entity_type: str
    value: str | None
    normalized_value: str | None
    unit: str | None
    reference_range: str | None
    confidence: float
    needs_human_review: bool
    source: dict[str, Any]
    review_reason: str | None = None
    test_name: str | None = None


def _source(page: int, text: str, bbox: dict[str, float] | None = None, method: str = "text") -> dict[str, Any]:
    return {"page": page, "quote": text[:240], "bbox": bbox, "method": method}


def _digital_pdf(content: bytes) -> list[dict[str, Any]]:
    import pdfplumber

    pages: list[dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(keep_blank_chars=False, use_text_flow=True) or []
            pages.append({
                "page": page_number,
                "text": page.extract_text(layout=False) or "",
                "words": words,
                "method": "pdfplumber",
            })
    return pages


def _ocr_pdf_page(page_image: Image.Image, page_number: int) -> dict[str, Any]:
    from .ocr import run_tesseract

    buffer = io.BytesIO()
    page_image.save(buffer, format="PNG")
    result = run_tesseract(buffer.getvalue(), page_number=page_number)
    words = [
        {"text": word.text, "x0": word.x, "top": word.y, "x1": word.x + word.width,
         "bottom": word.y + word.height, "confidence": word.confidence}
        for word in result.words
    ]
    return {"page": page_number, "text": result.text, "words": words, "method": result.engine,
            "ocr_needs_review": result.needs_human_review}


def _extract_pages(content: bytes, mime_type: str) -> list[dict[str, Any]]:
    if mime_type == "application/pdf":
        pages = _digital_pdf(content)
        for index, page in enumerate(pages):
            if len(page["text"].strip()) >= MIN_TEXT_CHARS_PER_PAGE:
                continue
            try:
                from pdf2image import convert_from_bytes
                rendered = convert_from_bytes(content, first_page=index + 1, last_page=index + 1, dpi=200)
                if rendered:
                    pages[index] = _ocr_pdf_page(rendered[0], index + 1)
            except ImportError:
                page["method"] = "pdfplumber"
                page["ocr_needs_review"] = True
                page["ocr_error"] = "pdf2image is not installed; scanned page was not OCR-processed."
            except Exception as exc:
                # Keep the original page text and make the OCR failure explicit.
                page["ocr_needs_review"] = True
                page["ocr_error"] = f"OCR fallback failed: {type(exc).__name__}"
        return pages

    from .ocr import run_tesseract
    result = run_tesseract(content, page_number=1)
    words = [
        {"text": word.text, "x0": word.x, "top": word.y, "x1": word.x + word.width,
         "bottom": word.y + word.height, "confidence": word.confidence}
        for word in result.words
    ]
    return [{"page": 1, "text": result.text, "words": words, "method": result.engine,
             "ocr_needs_review": result.needs_human_review}]


def _bbox_for_match(page: dict[str, Any], match_text: str) -> dict[str, float] | None:
    """Approximate a source bbox using only word boxes that literally occur in the matched text."""
    words = page.get("words") or []
    relevant = [word for word in words if str(word.get("text", "")).strip().lower() in match_text.lower().split()]
    if not relevant:
        return None
    return {
        "x0": float(min(word["x0"] for word in relevant)),
        "top": float(min(word["top"] for word in relevant)),
        "x1": float(max(word["x1"] for word in relevant)),
        "bottom": float(max(word["bottom"] for word in relevant)),
    }


def _find_date_entities(pages: list[dict[str, Any]]) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    pattern = re.compile(r"\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b", re.I)
    for page in pages:
        for match in pattern.finditer(page["text"]):
            raw = match.group(0)
            # Ambiguous numeric dates are intentionally not normalized.
            ambiguous = bool(re.fullmatch(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", raw))
            normalized = None
            if not ambiguous:
                for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
                    try:
                        normalized = datetime.strptime(raw.replace(".", ""), fmt).date().isoformat()
                        break
                    except ValueError:
                        pass
            entities.append(ExtractedEntity("report_date", raw, normalized, None, None,
                0.72 if ambiguous else 0.94, ambiguous or normalized is None,
                _source(page["page"], raw, _bbox_for_match(page, raw), page["method"]),
                "Ambiguous date format; confirm day/month ordering." if ambiguous else
                ("Date could not be normalized safely." if normalized is None else None)))
    return entities


# Only recognize a conservative list of common analytes; unknown labels are not inferred.
KNOWN_TESTS = [
    "hemoglobin", "haemoglobin", "wbc", "white blood cell count", "rbc", "platelet count",
    "fasting blood sugar", "blood glucose", "hba1c", "creatinine", "urea", "sodium",
    "potassium", "total cholesterol", "hdl cholesterol", "ldl cholesterol", "triglycerides",
    "tsh", "alt", "ast", "bilirubin", "vitamin d", "vitamin b12", "crp",
]
RESULT_PATTERN = re.compile(
    r"(?P<value>[<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>mg/dL|g/dL|mmol/L|µmol/L|umol/L|mIU/L|IU/L|U/L|%|10\^?\d*/(?:µL|uL|L)|"
    r"cells/(?:µL|uL)|ng/mL|pg/mL|mmol/mol|mEq/L|fL|pg|g/L)?"
    r"(?:\s+(?P<range>\d+(?:[.,]\d+)?\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?))?",
    re.I,
)


def normalize_test_name(label: str | None) -> str:
    """Canonicalize only known analyte aliases; preserve unknown labels without guessing."""
    raw = " ".join((label or "").strip().lower().split())
    raw = re.sub(r"[^a-z0-9]+", " ", raw).strip()
    aliases = {
        "hb": "hemoglobin", "hgb": "hemoglobin", "haemoglobin": "hemoglobin",
        "hemoglobin": "hemoglobin", "wbc": "wbc", "wbc count": "wbc",
        "white blood cell count": "wbc", "white blood cells": "wbc",
        "rbc": "rbc", "rbc count": "rbc", "red blood cell count": "rbc",
        "platelet count": "platelet count", "platelets": "platelet count",
        "hba1c": "hba1c", "hb a1c": "hba1c", "glycated hemoglobin": "hba1c",
        "fasting blood sugar": "glucose", "fasting glucose": "glucose",
        "blood glucose": "glucose", "glucose": "glucose",
        "creatinine": "creatinine", "serum creatinine": "creatinine",
        "urea": "urea", "serum urea": "urea", "sodium": "sodium",
        "potassium": "potassium", "total cholesterol": "total cholesterol",
        "cholesterol total": "total cholesterol", "hdl cholesterol": "hdl cholesterol",
        "hdl": "hdl cholesterol", "ldl cholesterol": "ldl cholesterol",
        "ldl": "ldl cholesterol", "triglycerides": "triglycerides",
        "tsh": "tsh", "alt": "alt", "sgpt": "alt", "ast": "ast", "sgot": "ast",
        "bilirubin": "bilirubin", "vitamin d": "vitamin d", "vitamin b12": "vitamin b12",
        "crp": "crp",
    }
    # Remove common parenthetical/specimen qualifiers only for recognized analytes.
    known_label_aliases = {
        "hemoglobin hb": "hemoglobin",
        "creatinine serum": "creatinine",
        "vitamin d 25 oh": "vitamin d",
        "vitamin d 25 hydroxy": "vitamin d",
        "wbc count": "wbc",
    }
    return aliases.get(raw, known_label_aliases.get(raw, raw))


def _find_lab_entities(pages: list[dict[str, Any]]) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    for page in pages:
        lines = page["text"].splitlines()
        for line in lines:
            lowered = line.lower()
            test_name = next((name for name in KNOWN_TESTS if re.search(rf"\b{re.escape(name)}\b", lowered)), None)
            if not test_name:
                continue
            match = RESULT_PATTERN.search(line)
            if not match:
                entities.append(ExtractedEntity("lab_result", None, None, None, None, 0.25, True,
                    _source(page["page"], line, _bbox_for_match(page, line), page["method"]),
                    "Known test label found but a reliable result value was not identified."))
                continue
            raw_value = match.group("value").replace(",", ".").strip()
            raw_unit = match.group("unit")
            raw_range = match.group("range")
            low_ocr = bool(page.get("ocr_needs_review"))
            # Do not label normal/high/low; interpretation depends on context and reference ranges.
            entities.append(ExtractedEntity(
                "lab_result", raw_value, raw_value, raw_unit, raw_range,
                0.60 if low_ocr else 0.88, low_ocr or raw_unit is None,
                _source(page["page"], line, _bbox_for_match(page, line), page["method"]),
                "OCR confidence is low." if low_ocr else ("Unit not detected; human confirmation required." if raw_unit is None else None),
                normalize_test_name(test_name),
            ))
    return entities


MEDICATION_PATTERN = re.compile(
    r"\b(?P<name>[A-Z][A-Za-z-]{2,}(?:\s+[A-Za-z-]{2,}){0,2})\s+"
    r"(?P<dose>\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|mL|ml|units?)\b)"
    r"(?:\s+(?P<route>oral|po|iv|im|sc|topical))?"
    r"(?:\s+(?P<frequency>once daily|twice daily|three times daily|od|bd|tds|qid|daily|weekly))?",
    re.I,
)


def _find_medications(pages: list[dict[str, Any]]) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    for page in pages:
        for match in MEDICATION_PATTERN.finditer(page["text"]):
            line = next((line for line in page["text"].splitlines() if match.group(0) in line), match.group(0))
            entities.append(ExtractedEntity(
                "medication", match.group("name").strip(), match.group("name").strip(),
                None, None, 0.55, True,
                {**_source(page["page"], line, _bbox_for_match(page, match.group(0)), page["method"]),
                 "dosage": match.group("dose"), "route": match.group("route"), "frequency": match.group("frequency")},
                "Rule-based medication match requires human confirmation; drug identity and instructions are not verified.",
            ))
    return entities


def process_document(filename: str, content_type: str | None, content: bytes) -> dict[str, Any]:
    """Validate, extract text/OCR, and parse entities with provenance."""
    mime_type = validate_document(filename, content_type, content)
    pages = _extract_pages(content, mime_type)
    entities = _find_date_entities(pages) + _find_lab_entities(pages) + _find_medications(pages)
    any_ocr_problem = any(page.get("ocr_needs_review") or page.get("ocr_error") for page in pages)
    for entity in entities:
        if any_ocr_problem and entity.source.get("method") == "tesseract":
            entity.needs_human_review = True
            entity.confidence = min(entity.confidence, 0.60)
            entity.review_reason = entity.review_reason or "OCR extraction needs human verification."
    return {
        "schema_version": "1.0",
        "extraction_engine": "rule-based-v1",
        "mime_type": mime_type,
        "page_count": len(pages),
        "pages": [
            {"page": page["page"], "text": page["text"], "method": page["method"],
             "ocr_error": page.get("ocr_error")}
            for page in pages
        ],
        "entities": [asdict(entity) for entity in entities],
        "needs_human_review": any(entity.needs_human_review for entity in entities) or any_ocr_problem,
        "review_reasons": [entity.review_reason for entity in entities if entity.review_reason]
            + [page["ocr_error"] for page in pages if page.get("ocr_error")],
    }
