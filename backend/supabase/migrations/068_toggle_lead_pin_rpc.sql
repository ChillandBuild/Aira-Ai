create or replace function toggle_lead_pin(p_lead_id uuid, p_tenant_id uuid)
returns setof leads
language plpgsql
as $$
declare
  v_pinned timestamptz;
begin
  select pinned_at into v_pinned from leads where id = p_lead_id and tenant_id = p_tenant_id;
  if not found then
    return;
  end if;
  if v_pinned is null then
    update leads set pinned_at = now() where id = p_lead_id and tenant_id = p_tenant_id;
  else
    update leads set pinned_at = null where id = p_lead_id and tenant_id = p_tenant_id;
  end if;
  return query select * from leads where id = p_lead_id and tenant_id = p_tenant_id;
end;
$$;
