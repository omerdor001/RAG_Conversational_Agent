import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/ingest/processor'
import { getFileType } from '@/lib/ingest/document-parser'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') || ''

  let sourceType: string
  let title: string
  let fileBuffer: Buffer | undefined
  let fileType: string | undefined
  let content: string | undefined
  let sourceUrl: string | undefined
  let storageUrl: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    sourceType = formData.get('sourceType') as string
    title = (formData.get('title') as string) || 'Untitled'

    if (sourceType === 'document') {
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 })
      }
      fileType = getFileType(file.name)
      title = title || file.name
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)

      // Upload to Supabase Storage
      const storagePath = `${user.id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, arrayBuffer, { contentType: file.type })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)
        storageUrl = urlData.publicUrl
      }

    } else if (sourceType === 'url') {
      sourceUrl = formData.get('url') as string
      title = title || sourceUrl

    } else if (sourceType === 'text') {
      content = formData.get('content') as string
    }
  } else {
    const body = await req.json()
    sourceType = body.sourceType
    title = body.title || 'Untitled'
    content = body.content
    sourceUrl = body.url
  }

  if (!['document', 'url', 'text'].includes(sourceType)) {
    return NextResponse.json({ error: 'Invalid source type' }, { status: 400 })
  }

  // Create document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      title,
      source_type: sourceType,
      source_url: storageUrl || sourceUrl || null,
      file_type: fileType || null,
      status: 'pending',
      metadata: { original_title: title },
    })
    .select()
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }

  // Process synchronously (Vercel has 60s limit — adequate for typical docs)
  try {
    await processDocument({
      documentId: doc.id,
      userId: user.id,
      sourceType: sourceType as 'document' | 'url' | 'text',
      content,
      fileBuffer,
      fileType,
      sourceUrl,
    })

    const { data: updated } = await supabase
      .from('documents')
      .select()
      .eq('id', doc.id)
      .single()

    return NextResponse.json({ success: true, document: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message, documentId: doc.id }, { status: 500 })
  }
}
