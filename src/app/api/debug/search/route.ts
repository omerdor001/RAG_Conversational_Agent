import { createClient } from '@/lib/supabase/server'
import { getEmbedding } from '@/lib/llm/provider'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const limit = parseInt(searchParams.get('limit') || '10')

  if (!query) return Response.json({ error: 'Missing ?q= parameter' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  let embedding: number[]
  try {
    embedding = await getEmbedding(query)
  } catch (err) {
    return Response.json({ error: `Embedding failed: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }

  // Run with threshold=0 to see all scores
  const { data, error } = await admin.rpc('match_chunks', {
    query_embedding: embedding,
    match_user_id: user.id,
    match_threshold: 0,
    match_count: limit,
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const results = (data || []).map((row: {
    id: string
    document_id: string
    content: string
    chunk_index: number
    similarity: number
    doc_title: string
  }) => ({
    similarity: Math.round(row.similarity * 1000) / 1000,
    doc_title: row.doc_title,
    chunk_index: row.chunk_index,
    snippet: row.content.slice(0, 120) + '…',
  }))

  return Response.json({
    query,
    embedding_dims: embedding.length,
    results,
    note: 'threshold=0 — showing all matches sorted by similarity',
  })
}
