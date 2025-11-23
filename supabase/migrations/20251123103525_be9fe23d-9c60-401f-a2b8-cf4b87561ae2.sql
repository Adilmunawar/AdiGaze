-- Create admin_profiles table for admin user information
CREATE TABLE public.admin_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name text,
  avatar_url text,
  email text,
  preferences jsonb DEFAULT '{}'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_profiles
CREATE POLICY "Users can view their own admin profile"
ON public.admin_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own admin profile"
ON public.admin_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own admin profile"
ON public.admin_profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own admin profile"
ON public.admin_profiles
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_admin_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_admin_profiles_updated_at
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_admin_profiles_updated_at();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_profiles (user_id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Trigger to create admin profile on user signup
CREATE TRIGGER on_auth_user_created_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_admin_user();

-- Create index for performance
CREATE INDEX idx_admin_profiles_user_id ON public.admin_profiles(user_id);