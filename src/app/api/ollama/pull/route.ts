import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { model } = await req.json()
  if (!model || typeof model !== 'string') {
    return new Response('Missing model', { status: 400 })
  }

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

  let ollamaRes: Response
  try {
    ollamaRes = await fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    })
  } catch {
    return Response.json({ error: 'Ollama is not running' }, { status: 502 })
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    return Response.json({ error: 'Ollama pull failed' }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const ollamaBody = ollamaRes.body

  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaBody.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.trim()) {
              controller.enqueue(encoder.encode(`data: ${line}\n\n`))
            }
          }
        }
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(`data: ${buffer}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch {
        controller.enqueue(encoder.encode('data: {"status":"error"}\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
