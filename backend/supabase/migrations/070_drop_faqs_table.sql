drop table if exists faqs cascade;

-- Remove 'faq' from reply_source check constraint
alter table messages drop constraint if exists messages_reply_source_check;
alter table messages add constraint messages_reply_source_check check (reply_source in ('knowledge', 'ai', 'automation'));
