-- Drop the old function
DROP FUNCTION IF EXISTS public.match_profiles(vector, double precision, integer);

-- Create the updated function with user_id filter
CREATE OR REPLACE FUNCTION public.match_profiles(
  query_embedding vector, 
  match_threshold double precision, 
  match_count integer,
  filter_user_id uuid
)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  return query
  select *
  from profiles
  where user_id = filter_user_id
    and 1 - (profiles.embedding <=> query_embedding) > match_threshold
  order by profiles.embedding <=> query_embedding
  limit match_count;
end;
$$;