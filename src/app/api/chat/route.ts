import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getLLMModel } from '@/lib/llm/provider'
import { retrieveChunks, retrieveRecommendations, chunksToContext, chunksToCitations } from '@/lib/rag/retriever'
import type { Citation, Recommendation } from '@/lib/types'

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, conversationId } = await req.json() as {
    messages: ChatMessage[]
    conversationId: string | null
  }

  const lastMessage = messages[messages.length - 1]
  const query = lastMessage?.content || ''
  if (!query.trim()) return new Response('Empty query', { status: 400 })

  // Fetch tenant's RAG config
  const { data: profile } = await supabase
    .from('profiles')
    .select('system_prompt, temperature, top_k, similarity_threshold')
    .eq('id', user.id)
    .single()

  const topK = profile?.top_k ?? 7
  const threshold = profile?.similarity_threshold ?? 0.72
  const systemPrompt = profile?.system_prompt ?? 'You are a helpful assistant. Answer questions based only on the provided context. Always cite your sources.'
  const temperature = profile?.temperature ?? 0.7

  // Retrieve with tenant isolation enforced at DB level (RLS + user_id filter)
  let citations: Citation[] = []
  let recommendations: Recommendation[] = []
  let contextText = ''
  let noResultsNote = ''

  try {
    const chunks = await retrieveChunks(query, user.id, topK, threshold)
    citations = chunksToCitations(chunks)

    if (chunks.length > 0) {
      contextText = chunksToContext(chunks)
      const excludeIds = [...new Set(chunks.map(c => c.document_id))]
      recommendations = await retrieveRecommendations(query, user.id, excludeIds, 3)
    } else {
      noResultsNote = '\n\n[No relevant content found in your knowledge base for this query. Answering from general knowledge — please note this is not from the knowledge base.]'
    }
  } catch (err) {
    console.error('Retrieval error:', err)
    noResultsNote = '\n\n[Retrieval temporarily unavailable.]'
  }

  const fullSystem = contextText
    ? `${systemPrompt}\n\nKNOWLEDGE BASE CONTEXT:\n${contextText}\n\nBase your answer strictly on the above context. Reference source names when citing. If context is insufficient, say so clearly.`
    : `${systemPrompt}${noResultsNote}`

  const result = streamText({
    model: getLLMModel(),
    system: fullSystem,
    messages,
    temperature,
    maxOutputTokens: 2048,
    onFinish: async ({ text }) => {
      if (!conversationId) return
      try {
        const { createClient: createSC } = await import('@/lib/supabase/server')
        const sc = await createSC()
        await sc.from('messages').insert([
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: 'user',
            content: query,
            citations: [],
            recommendations: [],
          },
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            content: text,
            citations,
            recommendations,
          },
        ])
        await sc
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
      } catch (e) {
        console.error('Failed to persist messages:', e)
      }
    },
  })

  return result.toTextStreamResponse({
    headers: {
      'X-Citations': JSON.stringify(citations),
      'X-Recommendations': JSON.stringify(recommendations),
    },
  })
}
