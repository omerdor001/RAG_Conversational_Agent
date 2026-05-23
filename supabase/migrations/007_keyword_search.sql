-- Add full-text search to chunks for hybrid (vector + keyword) retrieval.
-- This catches exact-phrase and keyword matches that pure vector search misses
-- (e.g. the acronym "RAG" in text vs semantic distance from the query "RAG").

-- Stored generated column: automatically maintained by Postgres for all existing and future rows
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast full-text lookups
CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv
  ON public.chunks USING GIN (content_tsv);

-- Hybrid search: 70% vector similarity + 30% keyword relevance.
-- Returns identical columns to match_chunks so the caller needs no changes.
-- A chunk is included if it passes the vector threshold OR has a keyword hit,
-- ensuring exact-phrase matches are never dropped by the similarity floor.
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text  text,
  query_embedding vector(768),
  match_user_id   uuid,
  match_threshold float DEFAULT 0.3,
  match_count     int   DEFAULT 10
)
RETURNS TABLE (
  id              uuid,
  document_id     uuid,
  content         text,
  chunk_index     int,
  token_count     int,
  metadata        jsonb,
  similarity      float,
  doc_title       text,
  doc_source_type text,
  doc_source_url  text,
  doc_file_type   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  tsq tsquery;
BEGIN
  -- Guard against empty or unparseable query strings
  BEGIN
    tsq := plainto_tsquery('english', query_text);
  EXCEPTION WHEN OTHERS THEN
    tsq := NULL;
  END;

  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    c.token_count,
    c.metadata,
    (
      (1 - (c.embedding <=> query_embedding)) * 0.7
      + CASE WHEN tsq IS NOT NULL THEN LEAST(ts_rank(c.content_tsv, tsq), 1.0) * 0.3
             ELSE 0.0 END
    )::float AS similarity,
    d.title       AS doc_title,
    d.source_type AS doc_source_type,
    d.source_url  AS doc_source_url,
    d.file_type   AS doc_file_type
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE
    c.user_id   = match_user_id
    AND d.user_id   = match_user_id
    AND d.status    = 'indexed'
    AND c.embedding IS NOT NULL
    AND (
      (1 - (c.embedding <=> query_embedding)) >= match_threshold
      OR (tsq IS NOT NULL AND c.content_tsv @@ tsq)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
