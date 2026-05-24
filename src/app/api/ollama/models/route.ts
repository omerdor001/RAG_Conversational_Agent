import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { cache: 'no-store' })
    if (!res.ok) return Response.json({ models: [] })
    const data = await res.json()
    const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name)
    return Response.json({ models: names })
  } catch {
    return Response.json({ models: [] })
  }
}
