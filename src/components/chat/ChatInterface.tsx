'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Plus, Square, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageItem } from './MessageItem'
import { ChatSidebar } from './ChatSidebar'
import type { Conversation, Citation, Recommendation } from '@/lib/types'

const MAX_MESSAGES_IN_UI = 50

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
  isEmbedded?: boolean
}

export function ChatInterface({ userId, userEmail, isEmbedded = false }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [citationsMap, setCitationsMap] = useState<Record<string, Citation[]>>({})
  const [recommendationsMap, setRecommendationsMap] = useState<Record<string, Recommendation[]>>({})
  const [outOfScopeMap, setOutOfScopeMap] = useState<Record<string, boolean>>({})
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'ready' | 'streaming'>('ready')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      await fetchConversations()
      const lastId = localStorage.getItem('lastConversationId')
      if (lastId) {
        await loadConversation(lastId)
      }
    }
    init()
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('lastConversationId', activeConversationId)
    } else {
      localStorage.removeItem('lastConversationId')
    }
  }, [activeConversationId])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  async function fetchConversations() {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations)
    }
  }

  // Core streaming helper — called by both sendMessage and the orphaned-message resume path.
  async function streamAssistantResponse(
    assistantId: string,
    chatHistory: { role: string; content: string }[],
    convId: string | null,
    isRetry = false,
  ) {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus('streaming')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory, conversationId: convId, isRetry }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      const SENTINEL = '\x1e'
      let rawBuffer = ''
      let metaExtracted = false
      let metaOffset = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        rawBuffer += decoder.decode(value, { stream: true })

        if (!metaExtracted) {
          if (rawBuffer.startsWith(SENTINEL)) {
            const closeIdx = rawBuffer.indexOf(SENTINEL, 1)
            if (closeIdx !== -1) {
              try {
                const meta = JSON.parse(rawBuffer.slice(1, closeIdx))
                setCitationsMap(prev => ({ ...prev, [assistantId]: meta.citations ?? [] }))
                setRecommendationsMap(prev => ({ ...prev, [assistantId]: meta.recommendations ?? [] }))
                if (meta.outOfScope) setOutOfScopeMap(prev => ({ ...prev, [assistantId]: true }))
              } catch (e) { console.warn('[ChatInterface] meta parse error:', e) }
              metaOffset = closeIdx + 1
              metaExtracted = true
            }
          } else if (rawBuffer.length > 0) {
            metaExtracted = true
          }
        }

        if (metaExtracted) {
          const snapshot = rawBuffer.slice(metaOffset)
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: snapshot } : m)
          )
        }
      }

      const fullText = rawBuffer.slice(metaOffset)

      // If the LLM self-reported out-of-scope (chunks were retrieved but didn't answer the question),
      // drop the spurious citations that were computed before streaming started.
      const outOfScopePhrases = [
        '💡 Not in your knowledge base',
        '💡 This answer is from my general knowledge',
        "I don't have real-time",
        "I don't have access to real-time",
        'I cannot access real-time',
        "I'm a large language model",
        "As a large language model",
        'not in the knowledge base',
        'not in your knowledge base',
      ]
      if (outOfScopePhrases.some(phrase => fullText.toLowerCase().includes(phrase.toLowerCase()))) {
        setCitationsMap(prev => ({ ...prev, [assistantId]: [] }))
        setOutOfScopeMap(prev => ({ ...prev, [assistantId]: true }))
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

  // Polls DB every 2 s for an assistant response that was saved while the client was away.
  // Returns true if found, false if timed out or the user navigated elsewhere.
  async function pollForAssistantResponse(convId: string, assistantId: string): Promise<boolean> {
    const MAX_POLLS = 60
    const POLL_INTERVAL = 2000

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))

      if (activeConversationIdRef.current !== convId) return false

      try {
        const res = await fetch(`/api/conversations/${convId}`)
        if (!res.ok) continue

        const data = await res.json()
        const freshMsgs: ChatMessage[] = data.messages.map(
          (m: { id: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })
        )

        const lastFresh = freshMsgs[freshMsgs.length - 1]
        if (lastFresh?.role === 'assistant') {
          const newCits: Record<string, Citation[]> = {}
          const newRecs: Record<string, Recommendation[]> = {}
          data.messages.forEach(
            (m: { id: string; citations: Citation[]; recommendations: Recommendation[] }) => {
              if (m.citations?.length) newCits[m.id] = m.citations
              if (m.recommendations?.length) newRecs[m.id] = m.recommendations
            }
          )
          setCitationsMap(newCits)
          setRecommendationsMap(newRecs)
          setOutOfScopeMap({})
          setMessages(freshMsgs.slice(-MAX_MESSAGES_IN_UI))
          setStatus('ready')
          return true
        }
      } catch {
        // Network error — continue polling
      }
    }

    return false
  }

  async function sendMessage(userInput: string, convId: string | null) {
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: userInput }
    const assistantId = genId()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg].slice(-MAX_MESSAGES_IN_UI))

    const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    await streamAssistantResponse(assistantId, chatHistory, convId)
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
    setStatus('ready')
    const res = await fetch(`/api/conversations/${id}`)
    if (!res.ok) return

    const data = await res.json()
    const msgs: ChatMessage[] = data.messages.map((m: { id: string; role: string; content: string }) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const newCits: Record<string, Citation[]> = {}
    const newRecs: Record<string, Recommendation[]> = {}
    data.messages.forEach((m: { id: string; citations: Citation[]; recommendations: Recommendation[] }) => {
      if (m.citations?.length) newCits[m.id] = m.citations
      if (m.recommendations?.length) newRecs[m.id] = m.recommendations
    })

    setCitationsMap(newCits)
    setRecommendationsMap(newRecs)
    setOutOfScopeMap({})

    const lastMsg = msgs[msgs.length - 1]

    // Orphaned user message: client disconnected before the assistant response was streamed.
    // Poll DB first — Ollama may have already finished and saved the response.
    // Only re-generate via LLM if polling times out (response genuinely never completed).
    if (lastMsg?.role === 'user') {
      const assistantId = genId()
      setMessages([...msgs, { id: assistantId, role: 'assistant' as const, content: '' }].slice(-MAX_MESSAGES_IN_UI))
      setStatus('streaming')

      const found = await pollForAssistantResponse(id, assistantId)
      if (!found && activeConversationIdRef.current === id) {
        // Fallback: response never arrived — re-generate without re-saving the user message
        const chatHistory = msgs.map(m => ({ role: m.role, content: m.content }))
        await streamAssistantResponse(assistantId, chatHistory, id, true)
      }
    } else {
      setMessages(msgs)
    }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (activeConversationId === id) {
      setActiveConversationId(null)
      setMessages([])
      setCitationsMap({})
      setRecommendationsMap({})
      setOutOfScopeMap({})
    }
    await fetchConversations()
  }

  function startNewChat() {
    setActiveConversationId(null)
    setMessages([])
    setCitationsMap({})
    setRecommendationsMap({})
    setOutOfScopeMap({})
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
      {!isEmbedded && (
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
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          {isEmbedded ? (
            <>
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-slate-300">AI Assistant</span>
              <div className="ml-auto">
                <Button variant="ghost" size="sm" onClick={startNewChat} className="text-slate-400 hover:text-white gap-1.5">
                  <Plus className="w-4 h-4" />New
                </Button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0"
          style={{ scrollBehavior: 'smooth' }}
        >
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
                isOutOfScope={!!outOfScopeMap[message.id]}
              />
            ))}
          </div>
        </div>

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
