-- Add source column to track where profiles came from
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal';

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.source IS 'Source of the profile: internal (uploaded by admin) or external (from landing page)';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_profiles_source ON public.profiles(source);