'use client'

import { useState } from 'react'
import { Bot, User, ChevronDown, ChevronUp, ExternalLink, FileText, Globe, Image, FileIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Citation, Recommendation } from '@/lib/types'

interface MessageItemProps {
  message: { id: string; role: 'user' | 'assistant'; content: string }
  citations: Citation[]
  recommendations: Recommendation[]
  isStreaming: boolean
}

export function MessageItem({ message, citations, recommendations, isStreaming }: MessageItemProps) {
  const [showCitations, setShowCitations] = useState(false)

  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('flex gap-3', isAssistant ? 'flex-row' : 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        isAssistant ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'
      )}>
        {isAssistant ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      <div className={cn('flex flex-col gap-2 max-w-[80%]', isAssistant ? 'items-start' : 'items-end')}>
        {/* Message bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isAssistant
            ? 'bg-slate-800 text-slate-100 rounded-tl-sm'
            : 'bg-indigo-600 text-white rounded-tr-sm'
        )}>
          {isStreaming && !message.content ? (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
            </span>
          ) : (
            <FormattedContent content={message.content} />
          )}
          {isStreaming && message.content && (
            <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {/* Citations toggle */}
        {isAssistant && citations.length > 0 && (
          <div className="w-full space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCitations(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 gap-1 h-auto py-1 px-2"
            >
              {showCitations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {citations.length} source{citations.length !== 1 ? 's' : ''}
            </Button>
            {showCitations && (
              <div className="space-y-2">
                {citations.map((c, i) => (
                  <CitationCard key={c.chunk_id} citation={c} index={i + 1} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {isAssistant && recommendations.length > 0 && !isStreaming && (
          <div className="w-full mt-1">
            <p className="text-xs text-slate-500 mb-2">You might also explore:</p>
            <div className="space-y-1.5">
              {recommendations.map((r, i) => (
                <RecommendationCard key={r.document_id + i} rec={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  // Simple markdown-like rendering: bold, code, line breaks
  const lines = content.split('\n')
  return (
    <div className="space-y-1 whitespace-pre-wrap break-words">
      {content}
    </div>
  )
}

function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case 'url': return <Globe className="w-3 h-3" />
    case 'image': return <Image className="w-3 h-3" />
    case 'document': return <FileText className="w-3 h-3" />
    default: return <FileIcon className="w-3 h-3" />
  }
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const confidence = Math.round(citation.similarity * 100)
  const confidenceColor = confidence >= 85 ? 'text-green-400' : confidence >= 70 ? 'text-yellow-400' : 'text-orange-400'

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">{index}</span>
          <SourceIcon type={citation.source_type} />
          <span className="truncate font-medium text-slate-300">{citation.document_title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-xs font-mono', confidenceColor)}>{confidence}%</span>
          {citation.source_url && (
            <a href={citation.source_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{citation.content_snippet}</p>
    </div>
  )
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
      <SourceIcon type={rec.source_type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-300 truncate">{rec.document_title}</p>
          {rec.source_url && (
            <a href={rec.source_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 flex-shrink-0">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{rec.snippet}</p>
      </div>
    </div>
  )
}
