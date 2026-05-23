import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint is called by the seed script — uses service role key
// Protected by a SEED_SECRET env var to prevent abuse
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  if (body.secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action } = body

  if (action === 'check') {
    // Return whether demo accounts are seeded
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data } = await supabase.auth.admin.listUsers()
    const emails = data?.users?.map(u => u.email) || []
    return NextResponse.json({
      student_seeded: emails.includes('student@demo.com'),
      investor_seeded: emails.includes('investor@demo.com'),
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
