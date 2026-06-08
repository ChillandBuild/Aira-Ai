CREATE TABLE IF NOT EXISTS app_notifications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
    ON app_notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
    ON app_notifications FOR UPDATE
    USING (user_id = auth.uid());
