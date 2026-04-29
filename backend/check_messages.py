from app.db.supabase import get_supabase
import json

def check_messages():
    db = get_supabase()
    lead = db.table('leads').select('id').eq('name', 'Test Lead').maybe_single().execute()
    if not lead.data:
        print("Test Lead not found")
        return
    
    lead_id = lead.data['id']
    print(f"Checking messages for Test Lead ({lead_id})")
    
    msgs = db.table('messages').select('*').eq('lead_id', lead_id).order('created_at', desc=True).limit(10).execute()
    for m in msgs.data:
        print(f"[{m['created_at']}] {m['direction'].upper()}: {m['content']} (AI: {m['is_ai_generated']})")

if __name__ == "__main__":
    check_messages()
