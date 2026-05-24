import { createOpenAI } from '@ai-sdk/openai'

const provider = process.env.LLM_PROVIDER || 'openai'
// Embedding provider can differ from the LLM provider so switching LLMs doesn't
// invalidate an existing indexed knowledge base (different models = incompatible spaces).
const embedProvider = process.env.EMBED_PROVIDER || provider

// Returns a model instance compatible with Vercel AI SDK
export function getLLMModel(modelOverride?: string) {
  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai(modelOverride || process.env.OPENAI_LLM_MODEL || 'gpt-4o-mini')
  }

  // Ollama via OpenAI-compatible API.
  // In @ai-sdk/openai v3 the default provider call routes to /v1/responses (Responses API)
  // which Ollama does not implement. .chat() explicitly targets /v1/chat/completions.
  //
  // If the DB profile stores an OpenAI model name (e.g. gpt-4o-mini) but the server
  // runs with LLM_PROVIDER=ollama, silently fall back to the Ollama default so the
  // request doesn't 404. OpenAI-style names are detected by their known prefixes.
  const isOpenAIModelName = /^(gpt-|o1|o3|o4|text-davinci|davinci|curie|babbage|ada)/.test(modelOverride ?? '')
  const ollamaModel = (modelOverride && !isOpenAIModelName)
    ? modelOverride
    : (process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b')

  const ollama = createOpenAI({
    baseURL: `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1`,
    apiKey: 'ollama',
  })
  return ollama.chat(ollamaModel)
}

export function getEmbeddingModelName(): string {
  if (embedProvider === 'openai') {
    return process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
  }
  return process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
}

export async function getEmbedding(text: string): Promise<number[]> {
  const cleanText = text.replace(/\n/g, ' ').trim()

  if (embedProvider === 'openai') {
    const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
    const body: Record<string, unknown> = { model: embedModel, input: cleanText }
    // `dimensions` is only supported by text-embedding-3-* models; sending it to
    // text-embedding-ada-002 returns a 400 and silently breaks retrieval.
    if (embedModel.startsWith('text-embedding-3')) {
      body.dimensions = 768
    }
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      throw new Error(`OpenAI embedding error (${response.status}): ${errText}`)
    }
    const data = await response.json()
    return data.data[0].embedding
  }

  // nomic-embed-text-v1.5 has n_ctx_train=2048; truncate at ~1800 tokens (~7200 chars) to avoid silent truncation
  const truncated = cleanText.length > 7200 ? cleanText.slice(0, 7200) : cleanText
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
      prompt: truncated,
    }),
  })
  if (!response.ok) throw new Error(`Ollama embedding error: ${response.statusText}`)
  const data = await response.json()
  return data.embedding
}

export async function getImageDescription(imageBase64: string, mimeType: string): Promise<string> {
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: 'Describe this image in detail, including all text, diagrams, charts, and visual information. Be thorough — this description will be used for semantic search.',
            },
          ],
        }],
        max_tokens: 1024,
      }),
    })
    if (!response.ok) throw new Error(`OpenAI vision error: ${response.statusText}`)
    const data = await response.json()
    return data.choices[0].message.content
  }

  // Ollama vision (llava) — optional, fails gracefully if not installed
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const visionModel = process.env.OLLAMA_VISION_MODEL || 'llava:7b'
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: visionModel,
      prompt: 'Describe this image in detail, including all text, diagrams, charts, and visual information. Be thorough — this description will be used for semantic search.',
      images: [imageBase64],
      stream: false,
    }),
  })
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Vision model "${visionModel}" is not installed. Fix: ollama pull ${visionModel}`)
    }
    throw new Error(`Ollama vision error: ${response.statusText}`)
  }
  const data = await response.json()
  return data.response
}
