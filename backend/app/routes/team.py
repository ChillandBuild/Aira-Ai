import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_and_role

logger = logging.getLogger(__name__)
router = APIRouter()


class InvitePayload(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    phone: str | None = None


@router.get("/me")
def get_me(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    caller = (
        db.table("callers")
        .select("id, name, phone, overall_score")
        .eq("user_id", ctx["user_id"])
        .eq("tenant_id", ctx["tenant_id"])
        .limit(1)
        .execute()
    )
    profile = caller.data[0] if caller and caller.data else None
    return {
        "tenant_id": ctx["tenant_id"],
        "role": ctx["role"],
        "caller_id": ctx.get("caller_id"),
        "caller_profile": profile,
    }


@router.get("/")
def list_team(ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can view team")
    db = get_supabase()
    members = (
        db.table("tenant_users")
        .select("user_id, role, created_at")
        .eq("tenant_id", ctx["tenant_id"])
        .execute()
    )
    user_ids = [m["user_id"] for m in (members.data or [])]
    callers = {}
    if user_ids:
        caller_rows = (
            db.table("callers")
            .select("user_id, id, name, phone, overall_score, active")
            .in_("user_id", user_ids)
            .eq("tenant_id", ctx["tenant_id"])
            .execute()
        )
        callers = {r["user_id"]: r for r in (caller_rows.data or [])}
    result = []
    for m in (members.data or []):
        result.append({
            **m,
            "caller_profile": callers.get(m["user_id"]),
        })
    return {"data": result}


@router.post("/invite")
async def invite_member(payload: InvitePayload, ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can invite members")

    db = get_supabase()
    try:
        result = db.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
        })
        user = result.user
        invited_user_id = user.id if hasattr(user, "id") else user["id"]
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "duplicate" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        logger.error(f"create_user failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to create user: {msg}")

    try:
        existing = (
            db.table("tenant_users")
            .select("id")
            .eq("user_id", invited_user_id)
            .eq("tenant_id", ctx["tenant_id"])
            .limit(1)
            .execute()
        )
        if not existing.data:
            db.table("tenant_users").insert({
                "tenant_id": ctx["tenant_id"],
                "user_id": invited_user_id,
                "role": "caller",
            }).execute()

        caller_existing = (
            db.table("callers")
            .select("id")
            .eq("user_id", invited_user_id)
            .eq("tenant_id", ctx["tenant_id"])
            .limit(1)
            .execute()
        )
        if not caller_existing.data:
            db.table("callers").insert({
                "tenant_id": ctx["tenant_id"],
                "user_id": invited_user_id,
                "name": payload.name or payload.email.split("@")[0],
                "phone": payload.phone,
                "active": True,
            }).execute()
    except Exception as e:
        logger.error(f"tenant_users/callers insert failed: {e}")
        raise HTTPException(status_code=500, detail=f"User created but assignment failed: {e}")

    logger.info(f"Created telecaller {payload.email} for tenant {ctx['tenant_id']}")
    return {"invited": True, "email": payload.email, "user_id": invited_user_id}


@router.delete("/{user_id}")
def remove_member(user_id: str, ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can remove members")
    db = get_supabase()
    db.table("tenant_users").delete().eq("user_id", user_id).eq("tenant_id", ctx["tenant_id"]).execute()
    db.table("callers").update({"active": False}).eq("user_id", user_id).eq("tenant_id", ctx["tenant_id"]).execute()
    return {"removed": True}
