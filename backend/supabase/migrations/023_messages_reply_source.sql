ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_source text CHECK (reply_source IN ('faq', 'knowledge', 'ai'));
