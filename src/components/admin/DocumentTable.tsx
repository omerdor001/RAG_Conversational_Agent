'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, RefreshCw, Globe, FileText, Image, Type, CheckCircle2, XCircle, Clock, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { Document } from '@/lib/types'

interface DocumentTableProps {
  documents: Document[]
  onRefresh: () => void
}

const SOURCE_ICONS = {
  url: Globe,
  document: FileText,
  image: Image,
  text: Type,
}

const SOURCE_LABELS = {
  url: 'URL',
  document: 'Document',
  image: 'Image',
  text: 'Text',
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const config = {
    indexed: { icon: CheckCircle2, label: 'Indexed', class: 'bg-green-500/10 text-green-400 border-green-500/20' },
    indexing: { icon: Loader2, label: 'Indexing...', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20', spin: true },
    pending: { icon: Clock, label: 'Pending', class: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    failed: { icon: XCircle, label: 'Failed', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[status]

  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', config.class)}>
      <Icon className={cn('w-3 h-3', (config as { spin?: boolean }).spin && 'animate-spin')} />
      {config.label}
    </span>
  )
}

export function DocumentTable({ documents, onRefresh }: DocumentTableProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reindexing, setReindexing] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Document deleted')
      onRefresh()
    } catch {
      toast.error('Failed to delete document')
    } finally {
      setDeleting(null)
    }
  }

  async function handleReindex(id: string) {
    setReindexing(id)
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reindex' }),
      })
      if (!res.ok) throw new Error('Reindex failed')
      toast.success('Document reindexed')
      onRefresh()
    } catch {
      toast.error('Failed to reindex')
    } finally {
      setReindexing(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No documents indexed yet.</p>
        <p className="text-xs mt-1">Upload a file, add a URL, or paste text above.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/50">
            <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Title</th>
            <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Type</th>
            <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Status</th>
            <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Chunks</th>
            <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Added</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {documents.map(doc => {
            const Icon = SOURCE_ICONS[doc.source_type] || FileText
            return (
              <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 max-w-xs">
                    <span className="text-slate-200 font-medium truncate">{doc.title}</span>
                    {doc.source_url && (
                      <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 flex-shrink-0">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {doc.status === 'failed' && doc.error_message && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">{doc.error_message}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Icon className="w-3 h-3" />
                    {SOURCE_LABELS[doc.source_type]}
                    {doc.file_type && <span className="text-slate-600 uppercase">.{doc.file_type}</span>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {doc.chunk_count > 0 ? (
                    <span>{doc.chunk_count} chunks · {doc.token_count.toLocaleString()} tokens</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-slate-500 hover:text-indigo-400"
                      onClick={() => handleReindex(doc.id)}
                      disabled={reindexing === doc.id}
                      title="Re-index"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', reindexing === doc.id && 'animate-spin')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-slate-500 hover:text-red-400"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      title="Delete"
                    >
                      {deleting === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
