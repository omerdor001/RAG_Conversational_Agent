import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getLLMModel, getEmbedding } from '@/lib/llm/provider'
import { retrieveChunks, retrieveChunksBySourceUrls, retrieveRecommendations, chunksToContext, chunksToCitations } from '@/lib/rag/retriever'
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
    .select('system_prompt, temperature, top_k, similarity_threshold, llm_model, max_tokens, enable_citations, role')
    .eq('id', user.id)
    .single()

  const topK = profile?.top_k ?? 4
  const threshold = profile?.similarity_threshold ?? 0.3
  const baseSystemPrompt = profile?.system_prompt ?? 'You are a helpful assistant. Answer questions based only on the provided context. Always cite your sources.'
  const role = profile?.role ?? null
  const systemPrompt = role ? `${baseSystemPrompt}\n\nYou specialise in the domain of: ${role}.` : baseSystemPrompt
  const temperature = profile?.temperature ?? 0.7
  // Keep default low for CPU-only Ollama — 2048 causes 5-min generation timeouts.
  // Users on GPU or cloud LLMs can raise this in the Admin panel.
  const maxTokens = profile?.max_tokens ?? 512
  const enableCitations = profile?.enable_citations ?? true

  // Retrieve with tenant isolation enforced at DB level (RLS + user_id filter)
  let citations: Citation[] = []
  let recommendations: Recommendation[] = []
  let contextText = ''
  let outOfScope = false
  let noResultsNote = ''

  try {
    // Extract URLs mentioned in the query for direct document lookup
    const queryUrls = (query.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g) ?? [])
      .map(u => u.replace(/[.,;:!?'"]+$/, ''))

    // Compute embedding once; reuse for both chunk retrieval and recommendations
    const queryEmbedding = await getEmbedding(query)
    const [vectorChunks, urlChunks] = await Promise.all([
      retrieveChunks(query, user.id, topK, threshold, queryEmbedding),
      retrieveChunksBySourceUrls(queryUrls, user.id, topK),
    ])

    // Merge: URL-exact matches first (highest priority), then vector results; deduplicate by id
    const seen = new Set<string>()
    const chunks = [...urlChunks, ...vectorChunks].filter(c => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })

    citations = enableCitations ? chunksToCitations(chunks) : []

    if (chunks.length > 0) {
      contextText = chunksToContext(chunks)
      const excludeIds = [...new Set(chunks.map(c => c.document_id))]
      recommendations = await retrieveRecommendations(query, user.id, excludeIds, 3, queryEmbedding)
    } else {
      outOfScope = true
      noResultsNote = '\n\n[RETRIEVAL RESULT: No relevant documents found in the knowledge base for this query.]\n\nYou MUST NOT answer from general knowledge or training data. Instead:\n1. Politely acknowledge that this specific topic is not covered in the current knowledge base.\n2. Based on your domain context (system prompt / role), briefly describe what topics the knowledge base DOES cover.\n3. Suggest 1-2 concrete, in-scope questions the user could ask instead.\n\nKeep the response concise (2-4 sentences). Do NOT include citation numbers, URLs, or fabricated sources.'
    }
  } catch (err) {
    console.error('Retrieval error:', err)
    outOfScope = true
    noResultsNote = '\n\n[RETRIEVAL FAILED: The knowledge base could not be searched due to a technical error.]\n\nDo NOT answer from general knowledge. Begin your response with:\n"⚠️ The knowledge base is temporarily unavailable — please try again in a moment."\n\nDo NOT include citation numbers, URLs, or fabricated sources.'
  }

  const groundingRules = `

CITATION RULES:
- Use inline citation numbers that match the context headers: [1], [2], [3], etc.
- ONLY include a URL if it appears verbatim in the context above — NEVER invent or fabricate any URL.
- Always write a full answer first, then add citations inline. Never output a bare number as your entire response.
- The user may use abbreviations or acronyms (e.g. "RAG", "LLM"). Check whether any context source title or content matches the expanded form before concluding it is not in the knowledge base.
- If the context does NOT contain information that answers the question, you MUST start your response with the EXACT phrase: "💡 Not in your knowledge base — from general knowledge:" (including the emoji and colon). Then answer with NO citation numbers and NO URLs. This rule is mandatory — never skip this prefix when the context is insufficient.`

  // When no KB context is found, drop the "answer only from context" restriction so
  // the model can fall back to general knowledge as instructed by noResultsNote.
  const fullSystem = contextText
    ? `${systemPrompt}\n\nKNOWLEDGE BASE CONTEXT:\n${contextText}${groundingRules}`
    : `${systemPrompt}${noResultsNote}`

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
    model: getLLMModel(profile?.llm_model ?? undefined),
    system: fullSystem,
    messages,
    temperature,
    maxOutputTokens: maxTokens,
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

  // Embed metadata as the first chunk using record-separator sentinels (\x1e).
  // Custom response headers are stripped by Vercel on streaming responses,
  // so we inline citations/recommendations/outOfScope into the body instead.
  const SENTINEL = '\x1e'
  const metaChunk = `${SENTINEL}${JSON.stringify({ citations, recommendations, outOfScope })}${SENTINEL}`

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let errored = false
      try {
        controller.enqueue(encoder.encode(metaChunk))
        const reader = result.textStream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) controller.enqueue(encoder.encode(value))
        }
        reader.releaseLock()
      } catch (err) {
        console.error('[chat/route] stream error:', err)
        errored = true
        controller.error(err)
      } finally {
        if (!errored) controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
