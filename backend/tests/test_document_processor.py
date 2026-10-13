import pytest

from app.services.document_processor import (
    DocumentValidationError,
    MAX_DOCUMENT_BYTES,
    normalize_test_name,
    validate_document,
)


def test_rejects_corrupted_pdf_signature():
    with pytest.raises(DocumentValidationError, match="signature"):
        validate_document("report.pdf", "application/pdf", b"not a pdf")


def test_rejects_oversized_file_before_parsing():
    with pytest.raises(DocumentValidationError, match="15 MiB"):
        validate_document("report.pdf", "application/pdf", b"%PDF-" + b"x" * MAX_DOCUMENT_BYTES)


def test_rejects_empty_and_mismatched_mime():
    with pytest.raises(DocumentValidationError, match="empty"):
        validate_document("report.pdf", "application/pdf", b"")
    with pytest.raises(DocumentValidationError, match="do not match"):
        validate_document("report.pdf", "image/png", b"%PDF-1.7")


@pytest.mark.parametrize(("raw", "expected"), [
    ("HbA1c", "hba1c"),
    ("Hemoglobin (Hb)", "hemoglobin"),
    ("WBC count", "wbc"),
    ("White Blood Cell Count", "wbc"),
    ("fasting blood sugar", "glucose"),
    ("Blood glucose", "glucose"),
    ("Creatinine, serum", "creatinine"),
    ("Vitamin D (25-OH)", "vitamin d"),
    ("Unknown test marker", "unknown test marker"),
])
def test_normalizes_known_lab_labels_without_guessing_unknowns(raw, expected):
    assert normalize_test_name(raw) == expected
