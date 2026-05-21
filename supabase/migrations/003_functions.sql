-- Semantic similarity search with tenant isolation enforced at DB level
-- user_id filter + RLS = defense in depth (both must pass)
create or replace function public.match_chunks(
  query_embedding vector(384),
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

-- Recommendation search: find related chunks excluding current document
create or replace function public.recommend_chunks(
  query_embedding vector(384),
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

-- Storage bucket for uploaded files and images
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Storage RLS: users can only access their own files
create policy "storage_select_own" on storage.objects
  for select using (auth.uid()::text = (storage.foldername(name))[1]);
create policy "storage_insert_own" on storage.objects
  for insert with check (auth.uid()::text = (storage.foldername(name))[1]);
create policy "storage_delete_own" on storage.objects
  for delete using (auth.uid()::text = (storage.foldername(name))[1]);
