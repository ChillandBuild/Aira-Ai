-- Migration: 030_add_conversation_state

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS conversation_state TEXT DEFAULT 'pending';

-- Possible values for conversation_state: 'pending', 'ai_active', 'opted_out'
