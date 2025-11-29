-- Create a table to store user-scoped data backups
CREATE TABLE IF NOT EXISTS public.data_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  label TEXT,
  data JSONB NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.data_backups ENABLE ROW LEVEL SECURITY;

-- RLS: users can view their own backups
CREATE POLICY "Users can view their own backups"
ON public.data_backups
FOR SELECT
USING (auth.uid() = user_id);

-- RLS: users can create their own backups
CREATE POLICY "Users can create their own backups"
ON public.data_backups
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS: users can delete their own backups
CREATE POLICY "Users can delete their own backups"
ON public.data_backups
FOR DELETE
USING (auth.uid() = user_id);

-- RLS: users can update their own backups (e.g. change label)
CREATE POLICY "Users can update their own backups"
ON public.data_backups
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Optional index to quickly query backups per user and by time
CREATE INDEX IF NOT EXISTS idx_data_backups_user_created_at
ON public.data_backups (user_id, created_at DESC);