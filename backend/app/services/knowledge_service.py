import asyncio
import base64
import logging
import io
from uuid import UUID
import pdfplumber
from docx import Document as DocxDocument
from pptx import Presentation
import pandas as pd
from groq import Groq
from app.db.supabase import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 50_000

_groq_client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


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
            if not _groq_client:
                raise ValueError("GROQ_API_KEY not configured — cannot extract text from images")
            b64 = base64.b64encode(file_content).decode("utf-8")
            response = _groq_client.chat.completions.create(
                model=_VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all text from this image. Return only the extracted text, no commentary."},
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                    ],
                }],
                temperature=0.0,
                max_tokens=4000,
            )
            text = (response.choices[0].message.content or "").strip()

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
