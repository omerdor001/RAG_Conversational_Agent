'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UploadForm } from '@/components/admin/UploadForm'
import { DocumentTable } from '@/components/admin/DocumentTable'
import { ConfigPanel } from '@/components/admin/ConfigPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bot, ArrowLeft, Database, Settings, Upload, RefreshCw, Loader2 } from 'lucide-react'
import type { Document, Profile } from '@/lib/types'

export default function AdminPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    await Promise.all([loadDocuments(), loadProfile()])
    setLoading(false)
  }

  async function loadDocuments() {
    const res = await fetch('/api/documents')
    if (res.ok) {
      const data = await res.json()
      setDocuments(data.documents)
    }
  }

  async function loadProfile() {
    const res = await fetch('/api/config')
    if (res.ok) {
      const data = await res.json()
      setProfile(data.profile)
    }
  }

  async function refreshDocuments() {
    setRefreshing(true)
    await loadDocuments()
    setRefreshing(false)
  }

  const indexedCount = documents.filter(d => d.status === 'indexed').length
  const totalChunks = documents.reduce((s, d) => s + (d.chunk_count || 0), 0)
  const totalTokens = documents.reduce((s, d) => s + (d.token_count || 0), 0)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">RAG Agent — Admin</h1>
              {profile?.email && <p className="text-xs text-slate-500">{profile.email}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/chat')} className="text-slate-400 hover:text-white gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Back to chat
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Documents', value: documents.length },
              { label: 'Indexed', value: indexedCount },
              { label: 'Chunks', value: totalChunks.toLocaleString() },
              { label: 'Tokens', value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : (
          <Tabs defaultValue="knowledge" className="w-full">
            <TabsList className="bg-slate-800 border border-slate-700">
              <TabsTrigger value="knowledge" className="gap-1.5 data-[state=active]:bg-indigo-600">
                <Database className="w-3.5 h-3.5" />Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5 data-[state=active]:bg-indigo-600">
                <Upload className="w-3.5 h-3.5" />Add Content
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5 data-[state=active]:bg-indigo-600">
                <Settings className="w-3.5 h-3.5" />Agent Config
              </TabsTrigger>
            </TabsList>

            {/* Knowledge base tab */}
            <TabsContent value="knowledge" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-300">Indexed content</h2>
                <Button variant="ghost" size="sm" onClick={refreshDocuments} disabled={refreshing} className="text-slate-400 hover:text-white gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <DocumentTable documents={documents} onRefresh={refreshDocuments} />
            </TabsContent>

            {/* Upload tab */}
            <TabsContent value="upload" className="mt-4">
              <div className="max-w-2xl">
                <h2 className="text-sm font-medium text-slate-300 mb-4">Add new content to your knowledge base</h2>
                <UploadForm onSuccess={refreshDocuments} />
              </div>
            </TabsContent>

            {/* Config tab */}
            <TabsContent value="config" className="mt-4">
              <div className="max-w-2xl">
                <h2 className="text-sm font-medium text-slate-300 mb-4">Agent configuration</h2>
                {profile && <ConfigPanel profile={profile} onUpdate={setProfile} />}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}
