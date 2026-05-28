import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.knowledge_service import process_document

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/documents")
async def list_documents(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    res = db.table("knowledge_documents").select("*").eq("tenant_id", tenant_id).order("created_at", desc=True).execute()
    return {"data": res.data or []}


@router.post("/upload-document")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id)
):
    content = await file.read()
    db = get_supabase()
    
    # 1. Create document record
    doc_data = {
        "tenant_id": tenant_id,
        "name": file.filename,
        "file_type": file.content_type or "application/octet-stream",
        "size_bytes": len(content),
        "status": "processing"
    }
    res = db.table("knowledge_documents").insert(doc_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create document record")
    
    doc_id = res.data[0]["id"]
    
    # 2. Process in background
    background_tasks.add_task(
        process_document,
        document_id=doc_id,
        tenant_id=tenant_id,
        file_content=content,
        filename=file.filename,
        mime_type=file.content_type
    )
    
    return res.data[0]



@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    # Chunks are deleted via CASCADE
    db.table("knowledge_documents").delete().eq("id", str(doc_id)).eq("tenant_id", tenant_id).execute()
    return {"success": True}
