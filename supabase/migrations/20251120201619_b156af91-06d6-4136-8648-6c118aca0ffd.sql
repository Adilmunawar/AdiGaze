-- Fix search path for match_profiles function
create or replace function match_profiles (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof profiles
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  select *
  from profiles
  where 1 - (profiles.embedding <=> query_embedding) > match_threshold
  order by profiles.embedding <=> query_embedding
  limit match_count;
end;
$$;