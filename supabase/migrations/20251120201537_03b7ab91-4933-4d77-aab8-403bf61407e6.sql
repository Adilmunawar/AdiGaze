-- Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- Add an embedding column to your profiles table
-- 768 dimensions is standard for Gemini text-embedding-004
alter table public.profiles 
add column embedding vector(768);

-- Create an index for faster vector similarity searches
create index on public.profiles using ivfflat (embedding vector_cosine_ops);

-- Create a search function for Supabase to use
create or replace function match_profiles (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns setof profiles
language plpgsql
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