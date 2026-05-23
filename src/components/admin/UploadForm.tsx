'use client'

import { useState, useCallback } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import { toast } from 'sonner'
import { Upload, Link, Type, FileText, Loader2, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface UploadFormProps {
  onSuccess: () => void
}

export function UploadForm({ onSuccess }: UploadFormProps) {
  const [uploading, setUploading] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileTitle, setFileTitle] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[]) => {
    setFileError(null)
    if (accepted[0]) {
      setSelectedFile(accepted[0])
      setFileTitle(accepted[0].name.replace(/\.[^/.]+$/, ''))
    }
  }, [])

  const onDropRejected = useCallback((rejectedFiles: FileRejection[]) => {
    const rejection = rejectedFiles[0]
    if (!rejection) return
    const tooBig = rejection.errors.find(e => e.code === 'file-too-large')
    if (tooBig) {
      setFileError(
        `File too large (${formatBytes(rejection.file.size)}). Maximum size is 10 MB.`
      )
    } else {
      setFileError(rejection.errors[0]?.message || 'File not accepted')
    }
    setSelectedFile(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  async function uploadFile() {
    if (!selectedFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append('sourceType', 'document')
    formData.append('file', selectedFile)
    formData.append('title', fileTitle || selectedFile.name)

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({ error: res.status === 504 ? 'Request timed out — try a smaller file' : 'Upload failed' }))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      toast.success(`"${fileTitle || selectedFile.name}" indexed successfully`)
      setSelectedFile(null)
      setFileTitle('')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function ingestURL() {
    if (!urlValue.trim()) return
    setUploading(true)
    const formData = new FormData()
    formData.append('sourceType', 'url')
    formData.append('url', urlValue)
    formData.append('title', urlTitle || urlValue)

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({ error: res.status === 504 ? 'Request timed out' : 'Ingestion failed' }))
      if (!res.ok) throw new Error(data.error || 'Ingestion failed')
      toast.success('URL indexed successfully')
      setUrlValue('')
      setUrlTitle('')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'URL ingestion failed')
    } finally {
      setUploading(false)
    }
  }

  async function ingestText() {
    if (!textContent.trim()) return
    setUploading(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'text', title: textTitle || 'Untitled text', content: textContent }),
      })
      const data = await res.json().catch(() => ({ error: 'Ingestion failed' }))
      if (!res.ok) throw new Error(data.error || 'Ingestion failed')
      toast.success('Text indexed successfully')
      setTextContent('')
      setTextTitle('')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Text ingestion failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Tabs defaultValue="file" className="w-full">
      <TabsList className="bg-slate-800 border border-slate-700">
        <TabsTrigger value="file" className="gap-1.5 data-[state=active]:bg-indigo-600">
          <FileText className="w-3.5 h-3.5" />File
        </TabsTrigger>
        <TabsTrigger value="url" className="gap-1.5 data-[state=active]:bg-indigo-600">
          <Link className="w-3.5 h-3.5" />URL
        </TabsTrigger>
        <TabsTrigger value="text" className="gap-1.5 data-[state=active]:bg-indigo-600">
          <Type className="w-3.5 h-3.5" />Raw text
        </TabsTrigger>
      </TabsList>

      {/* File */}
      <TabsContent value="file" className="space-y-4 mt-4">
        {fileError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{fileError}</span>
          </div>
        )}
        {!selectedFile ? (
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-indigo-500 bg-indigo-500/5'
                : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-300 font-medium">
              {isDragActive ? 'Drop it here' : 'Drop a file or click to browse'}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              PDF, DOCX, TXT, MD, CSV — up to 10MB
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-slate-200 font-medium truncate">{selectedFile.name}</span>
                <span className="text-xs text-slate-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setFileError(null) }} className="w-6 h-6 text-slate-500">
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Title (optional)</Label>
              <Input
                value={fileTitle}
                onChange={e => setFileTitle(e.target.value)}
                placeholder="Document title..."
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm"
              />
            </div>
            <Button onClick={uploadFile} disabled={uploading} className="w-full bg-indigo-600 hover:bg-indigo-500 gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Processing...' : 'Index this file'}
            </Button>
          </div>
        )}
      </TabsContent>

      {/* URL */}
      <TabsContent value="url" className="space-y-4 mt-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">URL</Label>
            <Input
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              placeholder="https://example.com/article"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Title (optional — auto-detected from page)</Label>
            <Input
              value={urlTitle}
              onChange={e => setUrlTitle(e.target.value)}
              placeholder="Leave blank to auto-detect"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <Button onClick={ingestURL} disabled={uploading || !urlValue.trim()} className="w-full bg-indigo-600 hover:bg-indigo-500 gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
            {uploading ? 'Scraping...' : 'Scrape & index URL'}
          </Button>
        </div>
      </TabsContent>

      {/* Raw text */}
      <TabsContent value="text" className="space-y-4 mt-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Title</Label>
            <Input
              value={textTitle}
              onChange={e => setTextTitle(e.target.value)}
              placeholder="Document title"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Content</Label>
            <Textarea
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
              placeholder="Paste your text content here..."
              className="bg-slate-700 border-slate-600 text-white min-h-[200px]"
            />
          </div>
          <Button onClick={ingestText} disabled={uploading || !textContent.trim()} className="w-full bg-indigo-600 hover:bg-indigo-500 gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
            {uploading ? 'Indexing...' : 'Index text'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
