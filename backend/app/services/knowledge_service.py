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

def _ensure_gemini():
    key = get_setting("gemini_api_key") or settings.gemini_api_key
    if key:
        genai.configure(api_key=key)

def extract_text_from_file(file_content: bytes, filename: str, mime_type: str) -> str:
    """Extract text from various file formats."""
    text = ""
    file_obj = io.BytesIO(file_content)
    
    try:
        if mime_type == "application/pdf" or filename.endswith(".pdf"):
            with pdfplumber.open(file_obj) as pdf:
                text = "\n".join([page.extract_text() or "" for page in pdf.pages])
        
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or filename.endswith(".docx"):
            doc = DocxDocument(file_obj)
            text = "\n".join([para.text for para in doc.paragraphs])
            
        elif mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation" or filename.endswith(".pptx"):
            prs = Presentation(file_obj)
            for slide in prs.slides:
                for shape in slide.shapes:
                    if hasattr(shape, "text"):
                        text += shape.text + "\n"
                        
        elif mime_type == "text/csv" or filename.endswith(".csv"):
            df = pd.read_csv(file_obj)
            text = df.to_string()
            
        elif mime_type in ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] or filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_obj)
            text = df.to_string()
            
        elif mime_type.startswith("image/"):
            # Use Gemini to extract text from images (multimodal OCR)
            _ensure_gemini()
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content([
                "Extract all text from this image. Return only the extracted text.",
                {"mime_type": mime_type, "data": file_content}
            ])
            text = response.text
            
        else:
            # Fallback for plain text
            try:
                text = file_content.decode("utf-8")
            except:
                text = str(file_content)
                
    except Exception as e:
        logger.error(f"Text extraction failed for {filename}: {e}")
        raise ValueError(f"Could not extract text from {filename}: {str(e)}")
        
    return text.strip()

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into chunks with overlap."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
        
    return chunks

async def process_document(document_id: UUID, tenant_id: str, file_content: bytes, filename: str, mime_type: str):
    """Full pipeline: Extract -> Chunk -> Embed -> Store."""
    db = get_supabase()
    
    try:
        # 1. Extract
        text = extract_text_from_file(file_content, filename, mime_type)
        if not text:
            raise ValueError("No text extracted from file")
            
        # 2. Chunk
        chunks = chunk_text(text)
        
        # 3. Embed and Store
        _ensure_gemini()
        stored = 0
        for i, chunk in enumerate(chunks):
            try:
                embedding_res = genai.embed_content(
                    model="models/text-embedding-004",
                    content=chunk,
                    task_type="retrieval_document",
                    title=filename
                )
                embedding = embedding_res["embedding"]

                db.table("knowledge_chunks").insert({
                    "document_id": str(document_id),
                    "tenant_id": tenant_id,
                    "content": chunk,
                    "embedding": embedding,
                    "metadata": {"index": i, "filename": filename}
                }).execute()
                stored += 1

            except Exception as e:
                logger.error(f"Failed to embed chunk {i} for doc {document_id}: {type(e).__name__}: {e}")

        # 4. Update status — only mark indexed if at least one chunk was stored
        if stored > 0:
            db.table("knowledge_documents").update({"status": "indexed"}).eq("id", str(document_id)).execute()
        else:
            db.table("knowledge_documents").update({
                "status": "failed",
                "error_message": f"All {len(chunks)} chunks failed to embed. Check Render logs for Gemini embedding errors."
            }).eq("id", str(document_id)).execute()
        
    except Exception as e:
        logger.error(f"Document processing failed for {document_id}: {e}")
        db.table("knowledge_documents").update({
            "status": "failed",
            "error_message": str(e)
        }).eq("id", str(document_id)).execute()

async def search_knowledge(query: str, tenant_id: str, limit: int = 5) -> list[str]:
    """Search for relevant chunks."""
    _ensure_gemini()
    try:
        # Get query embedding
        embedding_res = genai.embed_content(
            model="models/text-embedding-004",
            content=query,
            task_type="retrieval_query"
        )
        query_embedding = embedding_res["embedding"]
        
        # Search via RPC
        db = get_supabase()
        res = db.rpc("match_knowledge_chunks", {
            "query_embedding": query_embedding,
            "match_threshold": 0.3,
            "match_count": limit,
            "p_tenant_id": tenant_id
        }).execute()
        
        return [item["content"] for item in (res.data or [])]
        
    except Exception as e:
        logger.error(f"Knowledge search failed: {e}")
        return []
