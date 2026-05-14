create or replace function get_conversation_leads(
  p_tenant_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(lead_id uuid, last_reply_at timestamptz, total bigint)
language sql
stable
as $$
  select
    m.lead_id,
    max(m.created_at) as last_reply_at,
    count(distinct m.lead_id) over () as total
  from messages m
  where m.direction = 'inbound'
    and m.tenant_id = p_tenant_id
    and m.lead_id is not null
  group by m.lead_id
  order by last_reply_at desc
  limit p_limit
  offset p_offset;
$$;
