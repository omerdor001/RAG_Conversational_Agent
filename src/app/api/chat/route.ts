import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getLLMModel, getEmbedding } from '@/lib/llm/provider'
import { retrieveChunks, retrieveRecommendations, chunksToContext, chunksToCitations } from '@/lib/rag/retriever'
import type { Citation, Recommendation } from '@/lib/types'

export const maxDuration = 300

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, conversationId, isRetry } = await req.json() as {
    messages: ChatMessage[]
    conversationId: string | null
    isRetry?: boolean
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
  const threshold = profile?.similarity_threshold ?? 0.3
  const systemPrompt = profile?.system_prompt ?? 'You are a helpful assistant. Answer questions based only on the provided context. Always cite your sources.'
  const temperature = profile?.temperature ?? 0.7

  // Retrieve with tenant isolation enforced at DB level (RLS + user_id filter)
  let citations: Citation[] = []
  let recommendations: Recommendation[] = []
  let contextText = ''
  let outOfScope = false
  let noResultsNote = ''

  try {
    // Compute embedding once; reuse for both chunk retrieval and recommendations
    const queryEmbedding = await getEmbedding(query)
    const chunks = await retrieveChunks(query, user.id, topK, threshold, queryEmbedding)
    citations = chunksToCitations(chunks)

    if (chunks.length > 0) {
      contextText = chunksToContext(chunks)
      const excludeIds = [...new Set(chunks.map(c => c.document_id))]
      recommendations = await retrieveRecommendations(query, user.id, excludeIds, 3, queryEmbedding)
    } else {
      outOfScope = true
      noResultsNote = '\n\n[RETRIEVAL RESULT: No chunks from the knowledge base matched this query.]\n\nYou are now answering from your general training knowledge (not the KB). You MUST begin your response with exactly this line:\n"💡 This answer is from my general knowledge — not your knowledge base. To get KB-grounded answers, add relevant documents in the Admin panel."\n\nThen provide a genuinely helpful, accurate response to the user\'s question.'
    }
  } catch (err) {
    console.error('Retrieval error:', err)
    outOfScope = true
    noResultsNote = '\n\n[RETRIEVAL FAILED: The knowledge base could not be searched due to a technical error.]\n\nYou are answering from general knowledge. Begin your response with:\n"⚠️ The knowledge base is temporarily unavailable. Answering from general knowledge."\n\nThen provide a helpful response.'
  }

  const groundingRules = `

CITATION RULES:
- Use inline citation numbers that match the context headers: [1], [2], [3], etc.
- If a source has a URL, link it: [1](URL)
- Always write a full answer first, then add citations. Never output a bare number as your entire response.
- If context does not cover the question, say "💡 Not in your knowledge base — from general knowledge:" then answer.`

  // When no KB context is found, drop the "answer only from context" restriction so
  // the model can fall back to general knowledge as instructed by noResultsNote.
  const fullSystem = contextText
    ? `${systemPrompt}\n\nKNOWLEDGE BASE CONTEXT:\n${contextText}${groundingRules}`
    : `You are a helpful assistant.${noResultsNote}`

  // Save user message immediately so it's never lost if the client disconnects mid-stream.
  // Skip when isRetry=true — the user message is already in the DB from the original request.
  if (conversationId && !isRetry) {
    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'user',
        content: query,
        citations: [],
        recommendations: [],
      })
    } catch (e) {
      console.error('Failed to persist user message:', e)
    }
  }

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
        await sc.from('messages').insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'assistant',
          content: text,
          citations,
          recommendations,
        })
        await sc
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
      } catch (e) {
        console.error('Failed to persist assistant message:', e)
      }
    },
  })

  // Manually wrap the AI SDK text stream to avoid buffering / stream-close issues
  // that occur with toTextStreamResponse() + Ollama's compatibility mode.
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const reader = result.textStream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) controller.enqueue(encoder.encode(value))
        }
        reader.releaseLock()
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Citations': encodeURIComponent(JSON.stringify(citations)),
      'X-Recommendations': encodeURIComponent(JSON.stringify(recommendations)),
      'X-Out-Of-Scope': outOfScope ? 'true' : 'false',
    },
  })
}
