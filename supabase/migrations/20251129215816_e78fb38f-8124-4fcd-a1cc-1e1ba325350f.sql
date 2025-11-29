-- Table to store per-user Google Drive backup linkage (single file per user)
CREATE TABLE IF NOT EXISTS public.google_drive_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  drive_file_id TEXT,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_drive_backups_user_unique UNIQUE (user_id)
);

ALTER TABLE public.google_drive_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own drive backup linkage"
ON public.google_drive_backups
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own drive backup linkage"
ON public.google_drive_backups
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drive backup linkage"
ON public.google_drive_backups
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drive backup linkage"
ON public.google_drive_backups
FOR DELETE
USING (auth.uid() = user_id);

-- Simple trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.update_google_drive_backups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS google_drive_backups_set_updated_at ON public.google_drive_backups;
CREATE TRIGGER google_drive_backups_set_updated_at
BEFORE UPDATE ON public.google_drive_backups
FOR EACH ROW
EXECUTE FUNCTION public.update_google_drive_backups_updated_at();