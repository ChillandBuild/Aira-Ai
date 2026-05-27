create or replace function get_conversation_leads(
  p_tenant_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(lead_id uuid, last_reply_at timestamptz, last_message_content text, total bigint)
language sql
stable
as $$
  with conversation_leads as (
    select
      m.lead_id,
      max(m.created_at) as last_reply_at,
      (select m2.content from messages m2 where m2.lead_id = m.lead_id and m2.tenant_id = p_tenant_id order by m2.created_at desc limit 1) as last_message_content
    from messages m
    where m.direction = 'inbound'
      and m.tenant_id = p_tenant_id
      and m.lead_id is not null
    group by m.lead_id
  ),
  pinned_leads as (
    select
      l.id as lead_id,
      null::timestamptz as last_reply_at,
      null::text as last_message_content
    from leads l
    where l.tenant_id = p_tenant_id
      and l.pinned_at is not null
      and l.opted_out is not true
      and l.deleted_at is null
  ),
  combined as (
    select lead_id, last_reply_at, last_message_content from conversation_leads
    union
    select lead_id, last_reply_at, last_message_content from pinned_leads
  ),
  with_total as (
    select
      lead_id,
      last_reply_at,
      last_message_content,
      count(*) over () as total
    from combined
  )
  select
    lead_id,
    last_reply_at,
    last_message_content,
    total
  from with_total
  order by
    (select l.pinned_at from leads l where l.id = lead_id) desc nulls last,
    last_reply_at desc nulls last
  limit p_limit
  offset p_offset;
$$;
