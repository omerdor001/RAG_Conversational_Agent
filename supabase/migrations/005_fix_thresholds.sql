-- Lower similarity thresholds to improve recall.
-- Previous defaults (0.5 match, 0.60 recommend) were too aggressive and caused
-- relevant chunks to be filtered out, leaving the LLM with no KB context.

-- Lower profile default for new signups
alter table public.profiles
  alter column similarity_threshold set default 0.3;

-- Backfill existing profiles that still carry the old default
update public.profiles
  set similarity_threshold = 0.3
  where similarity_threshold = 0.5;

-- Rebuild recommend_chunks with a lower hardcoded floor (0.40 → was 0.60)
drop function if exists public.recommend_chunks(vector, uuid, uuid[], int);

create or replace function public.recommend_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  exclude_doc_ids uuid[],
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float,
  doc_title text,
  doc_source_type text,
  doc_source_url text
)
language sql stable security definer set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title as doc_title,
    d.source_type as doc_source_type,
    d.source_url as doc_source_url
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where
    c.user_id = match_user_id
    and d.user_id = match_user_id
    and d.status = 'indexed'
    and not (c.document_id = any(exclude_doc_ids))
    and 1 - (c.embedding <=> query_embedding) >= 0.40
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
