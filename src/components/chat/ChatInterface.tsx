'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Send, Loader2, Plus, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageItem } from './MessageItem'
import { ChatSidebar } from './ChatSidebar'
import type { Conversation, Citation, Recommendation } from '@/lib/types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

let msgCounter = 0
function genId() { return `msg_${++msgCounter}_${Date.now()}` }

interface ChatInterfaceProps {
  userId: string
  userEmail: string
}

export function ChatInterface({ userId, userEmail }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [citationsMap, setCitationsMap] = useState<Record<string, Citation[]>>({})
  const [recommendationsMap, setRecommendationsMap] = useState<Record<string, Recommendation[]>>({})
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'ready' | 'streaming'>('ready')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchConversations() {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations)
    }
  }

  async function sendMessage(userInput: string, convId: string | null) {
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: userInput }
    const assistantId = genId()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStatus('streaming')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory, conversationId: convId }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }

      // Read citations and recommendations from response headers
      try {
        const cits = JSON.parse(res.headers.get('X-Citations') || '[]') as Citation[]
        const recs = JSON.parse(res.headers.get('X-Recommendations') || '[]') as Recommendation[]
        setCitationsMap(prev => ({ ...prev, [assistantId]: cits }))
        setRecommendationsMap(prev => ({ ...prev, [assistantId]: recs }))
      } catch {}

      // Stream the text body
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        const snapshot = fullText
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: snapshot } : m)
        )
      }

      await fetchConversations()
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User stopped — keep whatever was streamed
      } else {
        toast.error('Chat error: ' + (err instanceof Error ? err.message : 'Unknown error'))
        setMessages(prev => prev.filter(m => m.id !== assistantId))
      }
    } finally {
      setStatus('ready')
      abortRef.current = null
    }
  }

  async function createNewConversation(firstMessage?: string): Promise<string | null> {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: firstMessage?.slice(0, 50) || 'New Conversation' }),
    })
    if (res.ok) {
      const data = await res.json()
      setConversations(prev => [data.conversation, ...prev])
      setActiveConversationId(data.conversation.id)
      return data.conversation.id
    }
    return null
  }

  async function loadConversation(id: string) {
    setActiveConversationId(id)
    const res = await fetch(`/api/conversations/${id}`)
    if (res.ok) {
      const data = await res.json()
      const msgs: ChatMessage[] = data.messages.map((m: { id: string; role: string; content: string }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      setMessages(msgs)
      const newCits: Record<string, Citation[]> = {}
      const newRecs: Record<string, Recommendation[]> = {}
      data.messages.forEach((m: { id: string; citations: Citation[]; recommendations: Recommendation[] }) => {
        if (m.citations?.length) newCits[m.id] = m.citations
        if (m.recommendations?.length) newRecs[m.id] = m.recommendations
      })
      setCitationsMap(newCits)
      setRecommendationsMap(newRecs)
    }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (activeConversationId === id) {
      setActiveConversationId(null)
      setMessages([])
      setCitationsMap({})
      setRecommendationsMap({})
    }
    await fetchConversations()
  }

  function startNewChat() {
    setActiveConversationId(null)
    setMessages([])
    setCitationsMap({})
    setRecommendationsMap({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || status === 'streaming') return
    setInput('')

    let convId = activeConversationId
    if (!convId) {
      convId = await createNewConversation(trimmed)
    }

    await sendMessage(trimmed, convId)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex h-screen bg-slate-950">
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversationId}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        onSelect={loadConversation}
        onNew={startNewChat}
        onDelete={deleteConversation}
        userEmail={userEmail}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white w-8 h-8">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </Button>
          )}
          <h2 className="text-sm font-medium text-slate-300 truncate">
            {activeConversationId
              ? conversations.find(c => c.id === activeConversationId)?.title || 'Conversation'
              : 'New Conversation'}
          </h2>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={startNewChat} className="text-slate-400 hover:text-white gap-1.5">
              <Plus className="w-4 h-4" />New
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z" fill="#6366f1" opacity="0.2"/>
                    <circle cx="16" cy="16" r="5" fill="#6366f1" opacity="0.5"/>
                    <path d="M16 9v7l4 4" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-200">Ask your knowledge base</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                  Get grounded answers from your indexed documents, URLs, and images — with source citations.
                </p>
              </div>
            )}
            {messages.map((message, i) => (
              <MessageItem
                key={message.id}
                message={message}
                citations={citationsMap[message.id] || []}
                recommendations={recommendationsMap[message.id] || []}
                isStreaming={status === 'streaming' && i === messages.length - 1 && message.role === 'assistant'}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-4">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your knowledge base..."
                className="min-h-[56px] max-h-40 resize-none bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-14 focus:border-indigo-500"
                disabled={status === 'streaming'}
              />
              <div className="absolute right-2 bottom-2">
                {status === 'streaming' ? (
                  <Button type="button" size="icon" variant="ghost" onClick={handleStop} className="text-slate-400 hover:text-white h-9 w-9">
                    <Square className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" disabled={!input.trim()} className="bg-indigo-600 hover:bg-indigo-500 h-9 w-9 disabled:opacity-40">
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </form>
            <p className="text-xs text-slate-600 mt-2 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  )
}
