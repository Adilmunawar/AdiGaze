-- Drop the trigger that creates profiles for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Delete any existing profile entries that were created for admin users
-- (profiles that don't have resume_text or resume_file_url are likely admin users)
DELETE FROM public.profiles
WHERE (resume_text IS NULL OR resume_text = '')
  AND (resume_file_url IS NULL OR resume_file_url = '')
  AND user_id IS NOT NULL;