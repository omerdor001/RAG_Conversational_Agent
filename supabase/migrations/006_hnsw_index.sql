-- Replace IVFFlat index with HNSW for better recall with small/medium datasets.
-- IVFFlat was created on an empty table (centroids not trained), causing
-- ivfflat.probes=1 (default) to miss results even when matching embeddings exist.
-- HNSW builds incrementally and has no cluster-centroid problem.

drop index if exists chunks_embedding_idx;

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
