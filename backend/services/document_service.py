"""
Document parsing service.
Handles PDF and text contract uploads for the contract advisor.
"""

import fitz  # PyMuPDF
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_DOCUMENT_CHARS = 50_000  # ~12k tokens — fits in Gemini Pro context


def extract_text_from_pdf(file_bytes: bytes, filename: str = "document.pdf") -> dict:
    """
    Extract text from a PDF file.
    Returns {text, page_count, extraction_method, truncated}.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            if text.strip():
                pages.append(f"[Page {page_num + 1}]\n{text}")

        doc.close()

        full_text = "\n\n".join(pages)
        truncated = False

        if len(full_text) > MAX_DOCUMENT_CHARS:
            full_text = full_text[:MAX_DOCUMENT_CHARS]
            truncated = True
            logger.info(f"Document truncated: {filename} ({len(full_text)} chars)")

        return {
            "text": full_text,
            "page_count": len(pages),
            "char_count": len(full_text),
            "extraction_method": "pymupdf",
            "truncated": truncated,
            "success": True,
        }

    except Exception as e:
        logger.error(f"PDF extraction failed for {filename}: {e}")
        return {
            "text": "",
            "page_count": 0,
            "char_count": 0,
            "extraction_method": "pymupdf",
            "truncated": False,
            "success": False,
            "error": str(e),
        }


def extract_text_from_upload(file_bytes: bytes, filename: str, content_type: str) -> dict:
    """
    Route to the right extractor based on file type.
    Supports: PDF, plain text, markdown.
    """
    filename_lower = filename.lower()

    if content_type == "application/pdf" or filename_lower.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes, filename)

    elif content_type in ("text/plain", "text/markdown") or filename_lower.endswith(
        (".txt", ".md")
    ):
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            truncated = False
            if len(text) > MAX_DOCUMENT_CHARS:
                text = text[:MAX_DOCUMENT_CHARS]
                truncated = True
            return {
                "text": text,
                "page_count": 1,
                "char_count": len(text),
                "extraction_method": "plain_text",
                "truncated": truncated,
                "success": True,
            }
        except Exception as e:
            return {"text": "", "success": False, "error": str(e)}

    else:
        return {
            "text": "",
            "success": False,
            "error": f"Unsupported file type: {content_type}. Upload a PDF or text file.",
        }


def infer_contract_type(text: str) -> str:
    """
    Heuristic to guess the contract type from the document text.
    Helps Gemini with context.
    """
    text_lower = text.lower()[:3000]  # check first 3k chars

    type_keywords = {
        "Commercial Lease": ["lease agreement", "landlord", "tenant", "premises", "rent", "square feet"],
        "Supplier Agreement": ["supplier", "vendor", "purchase order", "delivery", "goods", "wholesale"],
        "Independent Contractor Agreement": ["contractor", "independent contractor", "services", "deliverables", "1099"],
        "Service Agreement": ["service agreement", "services rendered", "scope of work", "retainer"],
        "Non-Disclosure Agreement": ["confidential", "nda", "non-disclosure", "proprietary information"],
        "Platform Terms of Service": ["terms of service", "user agreement", "platform", "account", "prohibited uses"],
        "Franchise Agreement": ["franchise", "franchisee", "franchisor", "royalty fee"],
    }

    scores = {}
    for contract_type, keywords in type_keywords.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        scores[contract_type] = score

    if max(scores.values()) == 0:
        return "Business Contract (type unclear)"

    return max(scores, key=scores.get)
