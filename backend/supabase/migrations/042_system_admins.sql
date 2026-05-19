CREATE TABLE IF NOT EXISTS system_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

INSERT INTO system_admins (user_id)
SELECT DISTINCT tu.user_id
FROM tenant_users tu
WHERE tu.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND tu.role = 'owner'
ON CONFLICT DO NOTHING;
