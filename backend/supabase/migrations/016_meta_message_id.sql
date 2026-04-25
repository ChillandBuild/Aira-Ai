alter table messages add column if not exists meta_message_id text;
create unique index if not exists idx_messages_meta_message_id on messages(meta_message_id) where meta_message_id is not null;
