-- Create admin_settings table for configurable settings
CREATE TABLE public.admin_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  receiving_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (receiving_email)
);

-- Enable RLS on admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_settings
CREATE POLICY "Users can view their own admin settings"
ON public.admin_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own admin settings"
ON public.admin_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own admin settings"
ON public.admin_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own admin settings"
ON public.admin_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Create external_submissions table
CREATE TABLE public.external_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT,
  candidate_phone TEXT,
  interested_job TEXT NOT NULL,
  resume_file_url TEXT NOT NULL,
  admin_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  parsed_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on external_submissions
ALTER TABLE public.external_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for external_submissions - admins can only see their submissions
CREATE POLICY "Admins can view their own submissions"
ON public.external_submissions
FOR SELECT
USING (auth.uid() = admin_user_id);

CREATE POLICY "Admins can update their own submissions"
ON public.external_submissions
FOR UPDATE
USING (auth.uid() = admin_user_id);

CREATE POLICY "Admins can delete their own submissions"
ON public.external_submissions
FOR DELETE
USING (auth.uid() = admin_user_id);

-- Service role can insert (for edge function)
CREATE POLICY "Service role can insert submissions"
ON public.external_submissions
FOR INSERT
WITH CHECK (true);

-- Create trigger for admin_settings updated_at
CREATE OR REPLACE FUNCTION public.update_admin_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_admin_settings_updated_at
BEFORE UPDATE ON public.admin_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_admin_settings_updated_at();

-- Create storage bucket for external resumes
INSERT INTO storage.buckets (id, name, public)
VALUES ('external-resumes', 'external-resumes', true);

-- Storage policies for external-resumes bucket
CREATE POLICY "Anyone can view external resumes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'external-resumes');

CREATE POLICY "Service role can upload external resumes"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'external-resumes');