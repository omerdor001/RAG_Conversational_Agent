import { createClient } from '@supabase/supabase-js'
import { chunkText } from '@/lib/rag/chunker'
import { getEmbedding, getImageDescription } from '@/lib/llm/provider'
import { parseFile, getFileType } from './document-parser'
import { scrapeURL } from './url-scraper'
import type { SourceType } from '@/lib/types'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface ProcessDocumentParams {
  documentId: string
  userId: string
  sourceType: SourceType
  content?: string        // raw text or pre-extracted content
  fileBuffer?: Buffer
  fileType?: string
  imageBase64?: string
  imageMimeType?: string
  sourceUrl?: string
}

export async function processDocument(params: ProcessDocumentParams): Promise<void> {
  const supabase = getSupabaseAdmin()

  // Mark as indexing
  await supabase
    .from('documents')
    .update({ status: 'indexing' })
    .eq('id', params.documentId)
    .eq('user_id', params.userId)

  try {
    let rawText = ''
    const metadata: Record<string, unknown> = {}

    if (params.sourceType === 'text') {
      rawText = params.content || ''
    } else if (params.sourceType === 'url') {
      const scraped = await scrapeURL(params.sourceUrl!)
      rawText = scraped.content
      metadata.page_title = scraped.title
      metadata.scraped_at = new Date().toISOString()
      metadata.description = scraped.description
      // Update doc title with scraped page title
      await supabase
        .from('documents')
        .update({ title: scraped.title, source_url: params.sourceUrl })
        .eq('id', params.documentId)
    } else if (params.sourceType === 'image') {
      if (!params.imageBase64 || !params.imageMimeType) throw new Error('Image data required')
      rawText = await getImageDescription(params.imageBase64, params.imageMimeType)
      metadata.is_image_description = true
      metadata.original_mime_type = params.imageMimeType
    } else if (params.sourceType === 'document') {
      if (!params.fileBuffer) throw new Error('File buffer required')
      rawText = await parseFile(params.fileBuffer, params.fileType || 'txt')
      metadata.file_type = params.fileType
    }

    if (!rawText.trim()) throw new Error('No extractable text content found')

    const chunks = chunkText(rawText)
    if (chunks.length === 0) throw new Error('Text too short to chunk')

    // Embed all chunks
    const embeddedChunks = await Promise.all(
      chunks.map(async (chunk) => ({
        user_id: params.userId,
        document_id: params.documentId,
        content: chunk.content,
        chunk_index: chunk.chunkIndex,
        token_count: chunk.tokenCount,
        metadata: {
          ...metadata,
          source_type: params.sourceType,
          source_url: params.sourceUrl || null,
        },
        embedding: await getEmbedding(chunk.content),
      }))
    )

    // Delete old chunks if re-indexing
    await supabase.from('chunks').delete().eq('document_id', params.documentId)

    // Batch insert chunks (Supabase has 1MB payload limit, batch by 50)
    const batchSize = 50
    for (let i = 0; i < embeddedChunks.length; i += batchSize) {
      const batch = embeddedChunks.slice(i, i + batchSize)
      const { error } = await supabase.from('chunks').insert(batch)
      if (error) throw new Error(`Chunk insert error: ${error.message}`)
    }

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0)

    await supabase
      .from('documents')
      .update({
        status: 'indexed',
        raw_content: rawText.slice(0, 50000), // store first 50k chars
        chunk_count: chunks.length,
        token_count: totalTokens,
        metadata,
        error_message: null,
      })
      .eq('id', params.documentId)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('documents')
      .update({ status: 'failed', error_message: message })
      .eq('id', params.documentId)
    throw err
  }
}
