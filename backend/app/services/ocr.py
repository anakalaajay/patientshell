"""OCR adapter with image preprocessing and explicit word-level source coordinates.

Tesseract is an optional system dependency. This module never guesses OCR output:
if the engine is unavailable or confidence is low, the caller receives a review flag.
"""
from __future__ import annotations

import io
import shutil
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class OCRWord:
    text: str
    confidence: float
    page: int
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class OCRResult:
    text: str
    words: list[OCRWord]
    engine: str
    needs_human_review: bool


def enhance_image(image_bytes: bytes) -> np.ndarray:
    """Convert to grayscale, denoise, and apply adaptive thresholding."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    rgb = np.asarray(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    return cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def run_tesseract(image_bytes: bytes, page_number: int = 1) -> OCRResult:
    """Run Tesseract OCR, preserving bounding boxes and engine confidence."""
    if not tesseract_available():
        raise RuntimeError("Tesseract OCR is not installed; OCR processing is unavailable.")
    import pytesseract
    from pytesseract import Output

    enhanced = enhance_image(image_bytes)
    data: dict[str, Any] = pytesseract.image_to_data(enhanced, output_type=Output.DICT, config="--psm 6")
    words: list[OCRWord] = []
    for index, raw in enumerate(data.get("text", [])):
        text = str(raw).strip()
        if not text:
            continue
        try:
            confidence = max(0.0, min(1.0, float(data["conf"][index]) / 100.0))
            x, y = int(data["left"][index]), int(data["top"][index])
            width, height = int(data["width"][index]), int(data["height"][index])
        except (KeyError, TypeError, ValueError):
            confidence, x, y, width, height = 0.0, 0, 0, 0, 0
        words.append(OCRWord(text, confidence, page_number, x, y, width, height))
    text = " ".join(word.text for word in words)
    return OCRResult(text, words, "tesseract", any(word.confidence < 0.75 for word in words) or not words)
