# _execute_step()

> God node · 29 connections · `backend/app/services/automation_engine.py`

**Community:** [[Bot Flow / Automation Engine]]

## Connections by Relation

### calls
- [[get_setting()]] `INFERRED`
- [[send_whatsapp()]] `INFERRED`
- [[auto_assign_lead()]] `INFERRED`
- [[record_stage_event()]] `INFERRED`
- [[get_or_create_state()]] `INFERRED`
- [[_drive_run()]] `EXTRACTED`
- [[record_assignment_event()]] `INFERRED`
- [[_send_text_via_channel()]] `EXTRACTED`
- [[_create_draft_booking()]] `INFERRED`
- [[send_media_message()]] `INFERRED`
- [[_evaluate_condition()]] `EXTRACTED`
- [[_get_booking_settings()]] `INFERRED`
- [[send_audio_message()]] `INFERRED`
- [[send_catalog_message()]] `INFERRED`
- [[send_list_message()]] `INFERRED`
- [[send_location_message()]] `INFERRED`
- [[create_payment_link()]] `INFERRED`
- [[_record_outbound()]] `EXTRACTED`
- [[_is_url_safe()]] `EXTRACTED`
- [[_generate_booking_ref()]] `INFERRED`

### contains
- [[automation_engine.py]] `EXTRACTED`

### rationale_for
- [[Execute one step and return {"status": "ok"|"skipped"|"error", "detail": ...}.]] `EXTRACTED`

### references
- [[str]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*