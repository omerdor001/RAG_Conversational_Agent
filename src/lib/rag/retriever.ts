import { createClient } from '@supabase/supabase-js'
import { getEmbedding } from '@/lib/llm/provider'
import type { MatchedChunk, Citation, Recommendation } from '@/lib/types'

// Service-role client used only server-side for vector operations
// RLS still enforced because match_chunks() filters by user_id explicitly
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function retrieveChunks(
  query: string,
  userId: string,
  topK = 7,
  threshold = 0.3,
  precomputedEmbedding?: number[]
): Promise<MatchedChunk[]> {
  const embedding = precomputedEmbedding ?? await getEmbedding(query)
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_user_id: userId,
    match_threshold: threshold,
    match_count: topK,
  })

  if (error) throw new Error(`Retrieval error: ${error.message}`)
  return (data || []) as MatchedChunk[]
}

export async function retrieveRecommendations(
  query: string,
  userId: string,
  excludeDocIds: string[],
  count = 3,
  precomputedEmbedding?: number[]
): Promise<Recommendation[]> {
  const embedding = precomputedEmbedding ?? await getEmbedding(query)
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('recommend_chunks', {
    query_embedding: embedding,
    match_user_id: userId,
    exclude_doc_ids: excludeDocIds,
    match_count: count * 2, // over-fetch then deduplicate by document
  })

  if (error) throw new Error(`Recommendation error: ${error.message}`)

  // Deduplicate by document_id, then by title to catch same doc uploaded twice
  const seenIds = new Set<string>()
  const seenTitles = new Set<string>()
  const recs: Recommendation[] = []
  for (const row of (data || [])) {
    const titleKey = (row.doc_title as string).trim().toLowerCase()
    if (seenIds.has(row.document_id) || seenTitles.has(titleKey) || recs.length >= count) continue
    seenIds.add(row.document_id)
    seenTitles.add(titleKey)
    recs.push({
      document_id: row.document_id,
      document_title: row.doc_title,
      source_type: row.doc_source_type,
      source_url: row.doc_source_url,
      snippet: row.content.slice(0, 200) + (row.content.length > 200 ? '...' : ''),
      similarity: row.similarity,
    })
  }
  return recs
}

export function chunksToContext(chunks: MatchedChunk[]): string {
  return chunks
    .map((c, i) => {
      const urlLine = c.doc_source_url ? `\nURL: ${c.doc_source_url}` : ''
      return `[${i + 1}] "${c.doc_title}"${urlLine}\n${c.content}`
    })
    .join('\n\n---\n\n')
}

export function chunksToCitations(chunks: MatchedChunk[]): Citation[] {
  // Deduplicate by document_id, keeping the highest-similarity chunk per document
  const byDocId = new Map<string, MatchedChunk>()
  for (const c of chunks) {
    const existing = byDocId.get(c.document_id)
    if (!existing || c.similarity > existing.similarity) {
      byDocId.set(c.document_id, c)
    }
  }
  // Secondary dedup by title (catches same document uploaded twice with different IDs)
  const seenTitles = new Set<string>()
  const result: Citation[] = []
  for (const c of byDocId.values()) {
    const key = c.doc_title.trim().toLowerCase()
    if (seenTitles.has(key)) continue
    seenTitles.add(key)
    result.push({
      chunk_id: c.id,
      document_id: c.document_id,
      document_title: c.doc_title,
      source_type: c.doc_source_type,
      source_url: c.doc_source_url,
      content_snippet: c.content.slice(0, 300) + (c.content.length > 300 ? '...' : ''),
      similarity: Math.round(c.similarity * 100) / 100,
      chunk_index: c.chunk_index,
    })
  }
  return result
}
