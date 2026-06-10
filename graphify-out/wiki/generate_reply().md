# generate_reply()

> God node · 32 connections · `backend/app/services/ai_reply.py`

**Community:** [[AI Reply Pipeline (Groq)]]

## Connections by Relation

### calls
- [[get_supabase()]] `INFERRED`
- [[get_setting()]] `INFERRED`
- [[whatsapp_webhook()]] `INFERRED`
- [[send_whatsapp()]] `EXTRACTED`
- [[auto_assign_lead()]] `INFERRED`
- [[get_telecalling_config()]] `INFERRED`
- [[compute_score()]] `INFERRED`
- [[record_stage_event()]] `INFERRED`
- [[sync_follow_up_jobs()]] `INFERRED`
- [[get_knowledge_context()]] `INFERRED`
- [[maybe_assign_lead()]] `INFERRED`
- [[get_inbox_config()]] `INFERRED`
- [[send_instagram()]] `EXTRACTED`
- [[send_telegram()]] `EXTRACTED`
- [[send_facebook()]] `EXTRACTED`
- [[_trigger_chat_escalation()]] `EXTRACTED`
- [[_create_draft_booking()]] `INFERRED`
- [[_is_similar()]] `EXTRACTED`
- [[fetchConversations()]] `EXTRACTED`
- [[should_escalate_hot_lead()]] `INFERRED`

### contains
- [[ai_reply.py]] `EXTRACTED`

### rationale_for
- [[Core pipeline:     1. Inject knowledge base context     2. Call Groq for reply]] `EXTRACTED`

### references
- [[str]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*