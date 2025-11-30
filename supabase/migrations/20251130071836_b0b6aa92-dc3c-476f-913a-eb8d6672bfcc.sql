-- Create table for two-factor authentication settings
CREATE TABLE public.two_factor_auth (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes TEXT[] DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.two_factor_auth ENABLE ROW LEVEL SECURITY;

-- Users can only view their own 2FA settings
CREATE POLICY "Users can view their own 2FA settings"
ON public.two_factor_auth
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own 2FA settings
CREATE POLICY "Users can insert their own 2FA settings"
ON public.two_factor_auth
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own 2FA settings
CREATE POLICY "Users can update their own 2FA settings"
ON public.two_factor_auth
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own 2FA settings
CREATE POLICY "Users can delete their own 2FA settings"
ON public.two_factor_auth
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_two_factor_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_two_factor_auth_updated_at
BEFORE UPDATE ON public.two_factor_auth
FOR EACH ROW
EXECUTE FUNCTION public.update_two_factor_auth_updated_at();