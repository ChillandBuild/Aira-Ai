from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import date
from uuid import UUID
from app.dependencies.auth import get_current_user
from app.db.supabase import get_supabase
from app.models.schemas import Todo, TodoCreate, SuccessResponse

router = APIRouter()

@router.get("/", response_model=List[Todo])
async def get_todos(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetch todos for the current user, optionally filtered by date range.
    """
    db = get_supabase()
    query = db.table("employee_todos").select("*").eq("user_id", current_user["id"])
    
    if start_date:
        query = query.gte("todo_date", start_date.isoformat())
    if end_date:
        query = query.lte("todo_date", end_date.isoformat())
        
    res = query.order("todo_date", desc=False).execute()
    return res.data

@router.post("/", response_model=Todo)
async def create_or_update_todo(
    todo: TodoCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new todo.
    """
    db = get_supabase()
    todo_data = todo.model_dump()
    todo_data["user_id"] = current_user["id"]
    
    res = db.table("employee_todos").insert(todo_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create todo")
    return res.data[0]

@router.patch("/{todo_id}", response_model=Todo)
async def update_todo(
    todo_id: UUID,
    is_completed: Optional[bool] = None,
    content: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a specific todo.
    """
    db = get_supabase()
    update_data = {}
    if is_completed is not None:
        update_data["is_completed"] = is_completed
    if content is not None:
        update_data["content"] = content
        
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
        
    res = db.table("employee_todos") \
        .update(update_data) \
        .eq("id", str(todo_id)) \
        .eq("user_id", current_user["id"]) \
        .execute()
        
    if not res.data:
        raise HTTPException(status_code=404, detail="Todo not found or unauthorized")
    return res.data[0]

@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a todo.
    """
    db = get_supabase()
    res = db.table("employee_todos") \
        .delete() \
        .eq("id", str(todo_id)) \
        .eq("user_id", current_user["id"]) \
        .execute()
        
    if not res.data:
        raise HTTPException(status_code=404, detail="Todo not found or unauthorized")
    return {"success": True}
