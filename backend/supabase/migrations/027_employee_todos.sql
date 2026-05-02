-- Migration: 027_employee_todos
-- Created: 2026-05-02
-- Description: Add table for employee to-dos/reminders linked to dates

CREATE TABLE IF NOT EXISTS employee_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    todo_date DATE NOT NULL,
    content TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups by user and date
CREATE INDEX IF NOT EXISTS idx_employee_todos_user_date ON employee_todos(user_id, todo_date);

-- Enable Row Level Security
ALTER TABLE employee_todos ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'employee_todos' AND policyname = 'Users can manage their own todos'
    ) THEN
        CREATE POLICY "Users can manage their own todos" 
            ON employee_todos FOR ALL 
            TO authenticated 
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_employee_todos_updated_at') THEN
        CREATE TRIGGER update_employee_todos_updated_at
            BEFORE UPDATE ON employee_todos
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
