-- 1. Add 'reengagement' to reply_source check constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_reply_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_reply_source_check
  CHECK (reply_source IN ('knowledge', 'ai', 'automation', 'reengagement'));

-- 2. Update get_conversation_leads RPC:
--    - Exclude [Template Broadcast:...] messages (pattern was [Template:%] missing these)
--    - Exclude re-engagement outbound messages (reply_source = 'reengagement')
--    Leads only appear in conversations when they have an inbound message
--    OR a manual (non-template, non-reengagement) outbound message.
DROP FUNCTION IF EXISTS get_conversation_leads(uuid,integer,integer);

CREATE OR REPLACE FUNCTION get_conversation_leads(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(lead_id uuid, last_reply_at timestamptz, last_message_content text, total bigint)
LANGUAGE sql
STABLE
AS $$
  WITH conversation_leads AS (
    SELECT
      m.lead_id,
      MAX(m.created_at) AS last_reply_at,
      (
        SELECT m2.content FROM messages m2
        WHERE m2.lead_id = m.lead_id AND m2.tenant_id = p_tenant_id
        ORDER BY m2.created_at DESC LIMIT 1
      ) AS last_message_content
    FROM messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM messages mx
        WHERE mx.lead_id = m.lead_id
          AND mx.tenant_id = p_tenant_id
          AND (
            mx.direction = 'inbound'
            OR (
              mx.direction = 'outbound'
              AND mx.content NOT LIKE '[Template%]'
              AND (mx.reply_source IS NULL OR mx.reply_source != 'reengagement')
            )
          )
      )
    GROUP BY m.lead_id
  ),
  pinned_leads AS (
    SELECT
      l.id AS lead_id,
      NULL::timestamptz AS last_reply_at,
      NULL::text AS last_message_content
    FROM leads l
    WHERE l.tenant_id = p_tenant_id
      AND l.pinned_at IS NOT NULL
      AND l.opted_out IS NOT TRUE
      AND l.deleted_at IS NULL
  ),
  combined AS (
    SELECT lead_id, last_reply_at, last_message_content FROM conversation_leads
    UNION
    SELECT lead_id, last_reply_at, last_message_content FROM pinned_leads
  ),
  with_total AS (
    SELECT
      lead_id,
      last_reply_at,
      last_message_content,
      COUNT(*) OVER () AS total
    FROM combined
  )
  SELECT
    lead_id,
    last_reply_at,
    last_message_content,
    total
  FROM with_total
  ORDER BY
    (SELECT l.pinned_at FROM leads l WHERE l.id = lead_id) DESC NULLS LAST,
    last_reply_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;
