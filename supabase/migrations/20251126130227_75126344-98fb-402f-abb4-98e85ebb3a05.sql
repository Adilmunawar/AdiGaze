-- Enable public access to resumes bucket for viewing
UPDATE storage.buckets
SET public = true
WHERE id = 'resumes';

-- Drop existing policies if they exist and recreate with correct logic
DROP POLICY IF EXISTS "Public can view all resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;

-- Allow public access to all resumes for viewing (for recruiters viewing candidates)
CREATE POLICY "Public can view all resumes"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'resumes');