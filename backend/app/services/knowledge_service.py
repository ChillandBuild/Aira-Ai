import asyncio
import logging
import io
from uuid import UUID
import pdfplumber
from docx import Document as DocxDocument
from pptx import Presentation
import pandas as pd
import google.generativeai as genai
from app.db.supabase import get_supabase
from app.config import settings
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 50_000


def _gemini_api_key() -> str:
    return get_setting("gemini_api_key") or settings.gemini_api_key or ""


def _ensure_gemini():
    key = _gemini_api_key()
    if key:
        genai.configure(api_key=key)


def extract_text_from_file(file_content: bytes, filename: str, mime_type: str) -> str:
    file_obj = io.BytesIO(file_content)
    text = ""
    try:
        if mime_type == "application/pdf" or filename.endswith(".pdf"):
            with pdfplumber.open(file_obj) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)

        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or filename.endswith(".docx"):
            doc = DocxDocument(file_obj)
            text = "\n".join(p.text for p in doc.paragraphs)

        elif mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation" or filename.endswith(".pptx"):
            prs = Presentation(file_obj)
            for slide in prs.slides:
                for shape in slide.shapes:
                    if hasattr(shape, "text"):
                        text += shape.text + "\n"

        elif mime_type == "text/csv" or filename.endswith(".csv"):
            df = pd.read_csv(file_obj)
            text = df.to_string()

        elif mime_type in ("application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") or filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_obj)
            text = df.to_string()

        elif mime_type.startswith("image/"):
            _ensure_gemini()
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content([
                "Extract all text from this image. Return only the extracted text.",
                {"mime_type": mime_type, "data": file_content},
            ])
            text = response.text

        else:
            try:
                text = file_content.decode("utf-8")
            except Exception:
                text = ""

    except Exception as e:
        logger.error(f"Text extraction failed for {filename}: {e}")
        raise ValueError(f"Could not extract text from {filename}: {e}")

    return text.strip()


async def process_document(document_id: UUID, tenant_id: str, file_content: bytes, filename: str, mime_type: str):
    db = get_supabase()
    try:
        text = await asyncio.to_thread(extract_text_from_file, file_content, filename, mime_type)
        if not text:
            raise ValueError("No text could be extracted from the file.")

        db.table("knowledge_documents").update({
            "status": "indexed",
            "full_text": text[:_MAX_TEXT_CHARS],
        }).eq("id", str(document_id)).execute()

        logger.info(f"Document {document_id} indexed — {len(text)} chars")

    except Exception as e:
        logger.error(f"Document processing failed for {document_id}: {e}")
        db.table("knowledge_documents").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", str(document_id)).execute()


async def get_knowledge_context(tenant_id: str) -> str:
    """Return full text of all indexed documents for this tenant, ready to inject into a prompt."""
    try:
        db = get_supabase()
        res = (
            db.table("knowledge_documents")
            .select("name,full_text")
            .eq("tenant_id", tenant_id)
            .eq("status", "indexed")
            .execute()
        )
        parts = []
        for doc in (res.data or []):
            if doc.get("full_text"):
                parts.append(f"=== {doc['name']} ===\n{doc['full_text']}")
        return "\n\n".join(parts)
    except Exception as e:
        logger.error(f"Knowledge context fetch failed: {e}")
        return ""
