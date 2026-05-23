import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const isEmbedded = params.embed === 'true'

  return (
    <ChatInterface
      userId={user.id}
      userEmail={user.email || ''}
      isEmbedded={isEmbedded}
    />
  )
}
