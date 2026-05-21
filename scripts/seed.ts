/**
 * Demo account seeding script.
 * Creates two demo accounts, embeds all knowledge base documents, and inserts them.
 *
 * Usage:
 *   npm run seed
 *
 * Requires environment variables from .env.local
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'all-minilm'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const CHUNK_SIZE = 400
const CHUNK_OVERLAP = 20

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function chunkText(text: string): Array<{ content: string; index: number; tokens: number }> {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0)
  const chunks: Array<{ content: string; index: number; tokens: number }> = []
  let current = ''
  let currentTokens = 0
  let overlapText = ''
  let idx = 0

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)
    if (currentTokens + paraTokens > CHUNK_SIZE && current.trim()) {
      const content = (overlapText + ' ' + current).trim()
      chunks.push({ content, index: idx++, tokens: estimateTokens(content) })
      const words = current.split(' ')
      const overlapWords = words.slice(Math.max(0, words.length - CHUNK_OVERLAP))
      overlapText = overlapWords.join(' ')
      current = para
      currentTokens = paraTokens
    } else {
      current += (current ? '\n\n' : '') + para
      currentTokens += paraTokens
    }
  }

  if (current.trim()) {
    const content = (overlapText + ' ' + current).trim()
    chunks.push({ content, index: idx++, tokens: estimateTokens(content) })
  }

  return chunks
}

async function getEmbedding(text: string): Promise<number[]> {
  const clean = text.replace(/\n/g, ' ').trim()
  if (LLM_PROVIDER === 'openai') {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: clean, dimensions: 384 }),
    })
    if (!res.ok) throw new Error(`OpenAI embed error: ${await res.text()}`)
    const data = await res.json()
    return data.data[0].embedding
  }
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: clean }),
  })
  if (!res.ok) throw new Error(`Ollama embed error: ${await res.text()}`)
  const data = await res.json()
  return data.embedding
}

async function ensureUser(email: string, password: string): Promise<string> {
  // Try to create; if exists, sign in to get the ID
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (!createErr && created?.user?.id) {
    console.log(`  ✓ Created user: ${email} (${created.user.id})`)
    return created.user.id
  }

  // User already exists — list and find
  const { data: list } = await supabase.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email === email)
  if (existing) {
    console.log(`  ✓ User already exists: ${email} (${existing.id})`)
    return existing.id
  }

  throw new Error(`Failed to create or find user ${email}: ${createErr?.message}`)
}

async function seedUserDocuments(userId: string, docsDir: string, domain: string) {
  const files = readdirSync(docsDir).filter(f => f.endsWith('.md'))
  console.log(`\n  Indexing ${files.length} documents for ${domain}...`)

  for (const file of files) {
    const title = file.replace('.md', '').replace(/-/g, ' ')
    const content = readFileSync(join(docsDir, file), 'utf-8')

    // Check if already indexed
    const { data: existing } = await supabase
      .from('documents')
      .select('id, status')
      .eq('user_id', userId)
      .eq('title', title)
      .single()

    if (existing?.status === 'indexed') {
      console.log(`    ↩ Already indexed: ${title}`)
      continue
    }

    // Create or update document record
    let docId = existing?.id
    if (!docId) {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          title,
          source_type: 'document',
          file_type: 'md',
          status: 'indexing',
          raw_content: content.slice(0, 50000),
          token_count: estimateTokens(content),
          metadata: { seeded: true },
        })
        .select('id')
        .single()

      if (error || !doc) throw new Error(`Failed to create document ${title}: ${error?.message}`)
      docId = doc.id
    } else {
      await supabase.from('documents').update({ status: 'indexing' }).eq('id', docId)
    }

    // Chunk and embed
    const chunks = chunkText(content)
    console.log(`    → ${title}: ${chunks.length} chunks`)

    // Delete old chunks
    await supabase.from('chunks').delete().eq('document_id', docId)

    const embeddedChunks = []
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content)
      embeddedChunks.push({
        user_id: userId,
        document_id: docId,
        content: chunk.content,
        chunk_index: chunk.index,
        token_count: chunk.tokens,
        embedding,
        metadata: { source_type: 'document', seeded: true },
      })
    }

    // Batch insert
    for (let i = 0; i < embeddedChunks.length; i += 50) {
      const batch = embeddedChunks.slice(i, i + 50)
      const { error } = await supabase.from('chunks').insert(batch)
      if (error) throw new Error(`Chunk insert error for ${title}: ${error.message}`)
    }

    await supabase.from('documents').update({
      status: 'indexed',
      chunk_count: chunks.length,
    }).eq('id', docId)

    console.log(`    ✓ Indexed: ${title}`)
  }
}

async function main() {
  console.log('\n🌱 RAG Agent — Seeding demo accounts\n')
  console.log(`Provider: ${LLM_PROVIDER}`)

  // Test embedding connection
  console.log('\nTesting embedding service...')
  try {
    await getEmbedding('test')
    console.log('  ✓ Embedding service OK')
  } catch (err) {
    console.error('  ✗ Embedding service failed:', err)
    console.error('    - If using Ollama: ensure it is running and "all-minilm" is pulled')
    console.error('    - If using OpenAI: check OPENAI_API_KEY')
    process.exit(1)
  }

  // Seed Tenant 1: Culinary Arts
  console.log('\n📚 Tenant 1: Culinary Arts (chef@demo.com)')
  const chefId = await ensureUser('chef@demo.com', 'demo123456')
  await seedUserDocuments(chefId, join(process.cwd(), 'scripts/seed-data/culinary'), 'Culinary Arts')

  // Seed Tenant 2: Personal Finance
  console.log('\n📚 Tenant 2: Personal Finance (investor@demo.com)')
  const investorId = await ensureUser('investor@demo.com', 'demo123456')
  await seedUserDocuments(investorId, join(process.cwd(), 'scripts/seed-data/finance'), 'Personal Finance')

  console.log('\n✅ Seeding complete!\n')
  console.log('Demo credentials:')
  console.log('  chef@demo.com     / demo123456  → Culinary Arts knowledge base')
  console.log('  investor@demo.com / demo123456  → Personal Finance knowledge base\n')
}

main().catch(err => {
  console.error('\n✗ Seeding failed:', err)
  process.exit(1)
})
