'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bot, Plus, MessageSquare, Trash2, Settings, ChevronLeft, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Conversation } from '@/lib/types'

interface ChatSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  userEmail: string
}

export function ChatSidebar({
  conversations,
  activeId,
  open,
  onToggle,
  onSelect,
  onNew,
  onDelete,
  userEmail,
}: ChatSidebarProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!open) return null

  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">RAG Agent</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle} className="text-slate-400 hover:text-white w-7 h-7">
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* New chat button */}
      <div className="p-3">
        <Button
          onClick={onNew}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2 h-9"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </Button>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-4">No conversations yet</p>
          )}
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={cn(
                'group flex items-center gap-2 w-full rounded-lg px-3 py-2 cursor-pointer transition-colors',
                activeId === conv.id
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{conv.title}</p>
                <p className="text-[10px] text-slate-600 truncate">
                  {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 w-6 h-6 text-slate-500 hover:text-red-400 flex-shrink-0"
                onClick={e => { e.stopPropagation(); onDelete(conv.id) }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer: user + admin link */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        <a
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs">Admin & Settings</span>
        </a>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300 font-medium flex-shrink-0">
            {userEmail[0].toUpperCase()}
          </div>
          <span className="text-xs text-slate-500 truncate flex-1">{userEmail}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="w-6 h-6 text-slate-500 hover:text-red-400"
          >
            <LogOut className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
