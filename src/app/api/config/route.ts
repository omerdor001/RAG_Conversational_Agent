import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create profile if the trigger didn't fire (e.g. user pre-dates migration)
  if (!data) {
    const admin = await createServiceClient()
    const { data: created, error: insertError } = await admin
      .from('profiles')
      .upsert({ id: user.id, email: user.email! }, { onConflict: 'id' })
      .select()
      .single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    data = created
  }

  return NextResponse.json({ profile: data })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = [
    'system_prompt', 'temperature', 'top_k', 'similarity_threshold', 'display_name',
    'role', 'llm_model', 'agent_persona', 'llm_provider', 'max_tokens',
    'enable_citations', 'enable_streaming',
  ]
  const updates: Record<string, unknown> = {}

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Use service role so the upsert works even when the user profile row doesn't exist yet
  // (profiles RLS has no INSERT policy — the trigger normally creates it at signup,
  //  but older/test accounts may be missing the row). User identity is pinned to user.id.
  const admin = await createServiceClient()
  const { data, error } = await admin
    .from('profiles')
    .upsert({ id: user.id, email: user.email!, ...updates }, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
