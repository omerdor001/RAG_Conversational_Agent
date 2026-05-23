-- Switch embedding model from all-minilm (384d, 256-token ctx) to
-- nomic-embed-text (768d, 8192-token ctx) for better RAG quality.
-- Existing chunk embeddings are dropped and must be re-indexed via seed.

-- Drop vector index before altering column
drop index if exists chunks_embedding_idx;

-- Resize embedding column (drops existing vectors; re-seed will repopulate)
alter table public.chunks drop column if exists embedding;
alter table public.chunks add column embedding vector(768);

-- Recreate match_chunks with 768-dim signature
drop function if exists public.match_chunks(vector, uuid, float, int);

create or replace function public.match_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  token_count int,
  metadata jsonb,
  similarity float,
  doc_title text,
  doc_source_type text,
  doc_source_url text,
  doc_file_type text
)
language sql stable security definer set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    c.token_count,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title as doc_title,
    d.source_type as doc_source_type,
    d.source_url as doc_source_url,
    d.file_type as doc_file_type
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where
    c.user_id = match_user_id
    and d.user_id = match_user_id
    and d.status = 'indexed'
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Recreate recommend_chunks with 768-dim signature
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
    and 1 - (c.embedding <=> query_embedding) >= 0.60
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Recreate IVFFlat index for cosine similarity on 768-dim vectors
create index chunks_embedding_idx on public.chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
