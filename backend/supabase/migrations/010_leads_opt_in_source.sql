-- opt_in_source: declares how a lead consented to be contacted
-- Used to gate bulk WhatsApp sends and determine allowed template types
alter table leads
  add column if not exists opt_in_source text check (opt_in_source in (
    'click_to_wa_ad',     -- bulk send OK, marketing templates OK
    'website_form',       -- bulk send OK, marketing templates OK
    'offline_event',      -- bulk send OK, utility templates preferred
    'previous_enquiry',   -- utility templates ONLY
    'imported',           -- utility templates ONLY
    'manual'              -- no bulk send, manual call only
  ));
