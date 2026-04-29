from app.db.supabase import get_supabase
import json

def check_faqs():
    db = get_supabase()
    res = db.table("faqs").select("*").execute()
    for row in res.data:
        print(f"ID: {row['id']}")
        print(f"Q: {row['question']}")
        print(f"Tenant ID: {row.get('tenant_id')}")
        print(f"Media ID: {row.get('media_id')}")
        print("-" * 20)

if __name__ == "__main__":
    check_faqs()
