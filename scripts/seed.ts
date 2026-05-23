/**
 * Demo account seeding script.
 * Creates two demo accounts and ingests knowledge base content from curated URLs.
 * Automatically applies DB migrations if DATABASE_URL is provided.
 *
 * Usage:
 *   npm run seed
 *
 * Requires environment variables from .env.local (or .env for Docker)
 */

import { setDefaultResultOrder } from 'dns'
// Force IPv4 DNS resolution — Docker containers often can't reach IPv6 addresses
// even when the host can. This prevents ENETUNREACH on Supabase's IPv6 endpoints.
setDefaultResultOrder('ipv4first')

import { config } from 'dotenv'
import { resolve, join } from 'path'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import ws from 'ws'

// Load env: .env.local for local dev, .env for Docker (docker-compose sets env directly)
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DATABASE_URL = process.env.DATABASE_URL || ''
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws as any },
})

// all-minilm has a 256-token context window; 200 tokens ≈ 800 chars keeps chunks safe
const CHUNK_SIZE = 200
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
      overlapText = words.slice(Math.max(0, words.length - CHUNK_OVERLAP)).join(' ')
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
  // nomic-embed-text supports 8192-token context; cap at 24000 chars (~6000 tokens)
  const truncated = clean.length > 24000 ? clean.slice(0, 24000) : clean
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: truncated }),
  })
  if (!res.ok) throw new Error(`Ollama embed error: ${await res.text()}`)
  const data = await res.json()
  return data.embedding
}

// ─── Schema Migration ────────────────────────────────────────────────────────

async function makePgClient() {
  const { Client } = await import('pg')
  const { resolve4 } = await import('dns/promises')

  const parsed = new URL(DATABASE_URL)
  let host = parsed.hostname
  try {
    const addrs = await resolve4(host)
    if (addrs.length > 0) host = addrs[0]
  } catch { /* keep hostname if resolve4 fails */ }

  return new Client({
    host,
    port: parseInt(parsed.port) || 5432,
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    // servername preserves SNI even when `host` is a resolved IPv4 address.
    // Supabase Supavisor needs SNI (or the postgres.<ref> username) to route connections.
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false, servername: parsed.hostname },
  })
}

async function applyMigrations(files: string[]): Promise<void> {
  const client = await makePgClient()
  await client.connect()
  try {
    const migrationDir = join(process.cwd(), 'supabase', 'migrations')
    for (const file of files) {
      const sql = readFileSync(join(migrationDir, file), 'utf-8')
      await client.query(sql)
      console.log(`  ✓ Applied: ${file}`)
    }
    await client.query(`NOTIFY pgrst, 'reload schema'`)
    console.log('  ✓ Schema cache refreshed')
    await new Promise(r => setTimeout(r, 3000))
  } finally {
    await client.end()
  }
}

async function getEmbeddingDimension(): Promise<number | null> {
  if (!DATABASE_URL) return null
  const client = await makePgClient()
  await client.connect()
  try {
    // pgvector stores atttypmod == N (the dimension count directly)
    const { rows } = await client.query<{ atttypmod: number }>(`
      SELECT atttypmod FROM pg_attribute
      WHERE attrelid = 'public.chunks'::regclass AND attname = 'embedding'
    `)
    if (rows.length === 0) return null
    return rows[0].atttypmod
  } catch {
    return null
  } finally {
    await client.end()
  }
}

async function ensureSchema(): Promise<void> {
  console.log('\nChecking database schema...')

  const { error } = await supabase.from('documents').select('id').limit(1)

  const isMissingTable =
    error?.message?.includes('Could not find the table') ||
    error?.code === 'PGRST200' ||
    error?.message?.includes('does not exist')

  if (error && !isMissingTable) {
    console.warn(`  ⚠ Schema check warning (${error.code}): ${error.message}`)
    return
  }

  if (isMissingTable) {
    // Tables don't exist — apply all migrations from scratch
    if (!DATABASE_URL) {
      console.error('\n❌ Database schema is not initialized and DATABASE_URL is not set.')
      console.error('\n   Option A — Automatic (recommended):')
      console.error('   Add DATABASE_URL to your .env file (Supabase Dashboard → Settings')
      console.error('   → Database → Connection String → URI), then re-run.')
      console.error('\n   Option B — Manual:')
      console.error('   Go to Supabase Dashboard → SQL Editor and run these files in order:')
      console.error('     supabase/migrations/001_initial_schema.sql')
      console.error('     supabase/migrations/002_rls_policies.sql')
      console.error('     supabase/migrations/003_functions.sql')
      console.error('     supabase/migrations/004_resize_embeddings.sql')
      console.error('     supabase/migrations/005_fix_thresholds.sql')
      console.error('     supabase/migrations/006_hnsw_index.sql')
      console.error('     supabase/migrations/007_keyword_search.sql')
      console.error('     supabase/migrations/008_agent_config.sql')
      console.error('     supabase/migrations/009_profile_role.sql')
      process.exit(1)
    }
    console.log('  Applying database migrations...')
    try {
      await applyMigrations([
        '001_initial_schema.sql',
        '002_rls_policies.sql',
        '003_functions.sql',
        '004_resize_embeddings.sql',
        '005_fix_thresholds.sql',
        '006_hnsw_index.sql',
        '007_keyword_search.sql',
        '008_agent_config.sql',
        '009_profile_role.sql',
      ])
      console.log('  ✓ Schema ready')
    } catch (err) {
      console.error(`  ✗ Migration failed: ${err instanceof Error ? err.message : err}`)
      console.error('\n   Apply migrations manually in Supabase Dashboard → SQL Editor')
      process.exit(1)
    }
    return
  }

  // Tables exist — check if embedding column matches nomic-embed-text's 768-dim output
  const dim = await getEmbeddingDimension()
  if (dim !== null && dim !== 768) {
    console.log(`  ⚠ Embedding column is ${dim}-dim but nomic-embed-text produces 768-dim. Applying migrations 004-007...`)
    if (!DATABASE_URL) {
      console.error('\n❌ DATABASE_URL is required to auto-apply migrations.')
      console.error('   Run these SQL files in Supabase Dashboard → SQL Editor:')
      console.error('     supabase/migrations/004_resize_embeddings.sql')
      console.error('     supabase/migrations/005_fix_thresholds.sql')
      console.error('     supabase/migrations/006_hnsw_index.sql')
      console.error('     supabase/migrations/007_keyword_search.sql')
      console.error('\n   WARNING: Migration 004 drops and recreates the embedding column — existing chunks will be deleted.')
      process.exit(1)
    }
    try {
      await applyMigrations(['004_resize_embeddings.sql', '005_fix_thresholds.sql', '006_hnsw_index.sql', '007_keyword_search.sql', '008_agent_config.sql', '009_profile_role.sql'])
      console.log('  ✓ Embedding column resized to 768-dim and index rebuilt')
    } catch (err) {
      console.error(`  ✗ Migration failed: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  } else {
    // Dimension is correct — still apply threshold/index fixes if DATABASE_URL is available
    if (DATABASE_URL) {
      try {
        await applyMigrations(['005_fix_thresholds.sql', '006_hnsw_index.sql', '007_keyword_search.sql', '008_agent_config.sql', '009_profile_role.sql'])
        console.log('  ✓ Schema ready (thresholds, index, keyword search, agent config, and profile role updated)')
      } catch {
        // Idempotent migrations — ignore errors (e.g. index already exists)
        console.log('  ✓ Schema ready')
      }
    } else {
      console.log('  ✓ Schema ready')
    }
  }
}

// ─── User & Seeding ──────────────────────────────────────────────────────────

async function ensureUser(email: string, password: string): Promise<string> {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (!createErr && created?.user?.id) {
    console.log(`  ✓ Created user: ${email} (${created.user.id})`)
    return created.user.id
  }

  const { data: list } = await supabase.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email === email)
  if (existing) {
    console.log(`  ✓ User already exists: ${email} (${existing.id})`)
    return existing.id
  }

  throw new Error(`Failed to create or find user ${email}: ${createErr?.message}`)
}

interface ScrapedPage {
  title: string
  content: string
}

async function scrapeURL(url: string): Promise<ScrapedPage> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RAGBot/1.0; +https://github.com/ragagent)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    const text = await response.text()
    return { title: url, content: text }
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  const title =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url

  $('script, style, nav, header, footer, aside, .nav, .navbar, .sidebar, .footer, .header, .menu, .cookie, .advertisement, .ad, [aria-hidden="true"]').remove()

  let content = ''
  for (const sel of ['main', 'article', '[role="main"]', '.content', '.post', '.article', '#content', '#main', 'body']) {
    const el = $(sel)
    if (el.length) {
      content = el.text()
      break
    }
  }

  content = content
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!content || content.length < 100) {
    content = $('body').text().replace(/\s+/g, ' ').trim()
  }

  return { title, content }
}

async function seedUserFromUrls(userId: string, domain: string, urls: string[]) {
  const uniqueUrls = [...new Set(urls)]
  if (uniqueUrls.length !== urls.length) {
    console.warn(`  ⚠ Removed ${urls.length - uniqueUrls.length} duplicate URL(s) from seed data`)
  }
  urls = uniqueUrls
  console.log(`\n  Ingesting ${urls.length} URLs for ${domain}...`)

  let successCount = 0
  let skipCount = 0
  let failCount = 0

  for (const url of urls) {
    // Skip if already fully indexed AND embeddings are actually present
    const { data: existing } = await supabase
      .from('documents')
      .select('id, status')
      .eq('user_id', userId)
      .eq('source_url', url)
      .maybeSingle()

    if (existing?.status === 'indexed') {
      // Guard: a schema migration may have wiped embeddings without changing doc status.
      // Only skip if at least one chunk has a non-null embedding.
      const { count: embeddedCount } = await supabase
        .from('chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', existing.id)
        .not('embedding', 'is', null)

      if ((embeddedCount ?? 0) > 0) {
        console.log(`    ↩ Already indexed: ${url}`)
        skipCount++
        continue
      }
      console.log(`    ⚠ Embeddings missing — re-indexing: ${url}`)
    }

    if (existing?.status === 'indexing') {
      console.log(`    ↩ Already indexing (in progress): ${url}`)
      skipCount++
      continue
    }

    console.log(`    ⬇ Fetching: ${url}`)

    let scraped: ScrapedPage
    try {
      scraped = await scrapeURL(url)
    } catch (err) {
      console.error(`    ✗ Scrape failed: ${err instanceof Error ? err.message : err}`)
      failCount++
      continue
    }

    if (!scraped.content || scraped.content.length < 200) {
      console.warn(`    ⚠ Thin content (${scraped.content?.length ?? 0} chars), skipping`)
      failCount++
      continue
    }

    // Cap content to ~10k tokens to keep chunk count manageable and seeding fast
    const MAX_CONTENT_CHARS = 40000
    scraped.content = scraped.content.slice(0, MAX_CONTENT_CHARS)

    // Upsert document record
    let docId: string = existing?.id
    if (!docId) {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          title: scraped.title,
          source_type: 'url',
          source_url: url,
          status: 'indexing',
          raw_content: scraped.content,
          token_count: estimateTokens(scraped.content),
          metadata: { seeded: true, scraped_at: new Date().toISOString() },
        })
        .select('id')
        .single()

      if (error || !doc) {
        console.error(`    ✗ Failed to create document record: ${error?.message}`)
        failCount++
        continue
      }
      docId = doc.id
    } else {
      await supabase.from('documents').update({ status: 'indexing' }).eq('id', docId)
    }

    const chunks = chunkText(scraped.content)
    if (chunks.length === 0) {
      console.warn(`    ⚠ No chunks produced, skipping`)
      await supabase.from('documents').update({ status: 'failed', error_message: 'No chunks produced' }).eq('id', docId)
      failCount++
      continue
    }

    // Embed and store chunks
    await supabase.from('chunks').delete().eq('document_id', docId)

    const embeddedChunks = []
    let embedFailed = false
    for (const chunk of chunks) {
      try {
        const embedding = await getEmbedding(chunk.content)
        embeddedChunks.push({
          user_id: userId,
          document_id: docId,
          content: chunk.content,
          chunk_index: chunk.index,
          token_count: chunk.tokens,
          embedding,
          metadata: { source_type: 'url', source_url: url, seeded: true },
        })
      } catch (err) {
        console.error(`    ✗ Embedding failed: ${err instanceof Error ? err.message : err}`)
        embedFailed = true
        break
      }
    }

    if (embedFailed) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Embedding error' }).eq('id', docId)
      failCount++
      continue
    }

    for (let i = 0; i < embeddedChunks.length; i += 50) {
      const { error } = await supabase.from('chunks').insert(embeddedChunks.slice(i, i + 50))
      if (error) {
        console.error(`    ✗ Chunk insert error: ${error.message}`)
        await supabase.from('documents').update({ status: 'failed', error_message: error.message }).eq('id', docId)
        embedFailed = true
        break
      }
    }

    if (embedFailed) {
      failCount++
      continue
    }

    const totalTokens = chunks.reduce((s, c) => s + c.tokens, 0)
    await supabase.from('documents').update({
      status: 'indexed',
      chunk_count: chunks.length,
      token_count: totalTokens,
    }).eq('id', docId)

    console.log(`    ✓ "${scraped.title}": ${chunks.length} chunks (~${totalTokens} tokens)`)
    successCount++

    // Rate limit: be polite to target sites
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log(`\n  Summary: ${successCount} indexed, ${skipCount} skipped, ${failCount} failed`)
}

// ─── Knowledge Base: AI Agents & Multi-Agent Systems ────────────────────────
// LangGraph docs render via JS (empty page on fetch) — replaced with Wikipedia
// and open-access sources that scrape reliably.

const AI_AGENTS_URLS = [
  // LangChain Agents (8 URLs)
  'https://python.langchain.com/docs/modules/agents/',
  'https://python.langchain.com/docs/modules/agents/agent_types/',
  'https://python.langchain.com/docs/modules/agents/agent_types/react',
  'https://python.langchain.com/docs/modules/agents/agent_types/openai_functions_agent',
  'https://python.langchain.com/docs/modules/agents/agent_types/structured_chat',
  'https://python.langchain.com/docs/modules/agents/tools/',
  'https://python.langchain.com/docs/modules/agents/tools/custom_tools',
  'https://python.langchain.com/docs/modules/memory/',

  // Agent theory — Wikipedia (reliable, focused articles)
  'https://en.wikipedia.org/wiki/Intelligent_agent',
  'https://en.wikipedia.org/wiki/Multi-agent_system',
  'https://en.wikipedia.org/wiki/Retrieval-augmented_generation',
  'https://en.wikipedia.org/wiki/Prompt_engineering',
  'https://en.wikipedia.org/wiki/Chain-of-thought_prompting',
  // LlamaIndex (3 working URLs)
  'https://docs.llamaindex.ai/en/stable/understanding/',
  'https://docs.llamaindex.ai/en/stable/module_guides/deploying/agents/',
  'https://docs.llamaindex.ai/en/stable/module_guides/querying/',

  // CrewAI (4 URLs)
  'https://docs.crewai.com/introduction',
  'https://docs.crewai.com/core-concepts/Agents/',
  'https://docs.crewai.com/core-concepts/Tasks/',
  'https://docs.crewai.com/core-concepts/Crews/',

  // Research & Best Practices (4 URLs)
  'https://lilianweng.github.io/posts/2023-06-23-agent/',
  'https://www.anthropic.com/news/tool-use-ga',
  'https://arxiv.org/abs/2210.03629',
]

// ─── Knowledge Base: Personal Finance & FIRE Movement ───────────────────────
// Investopedia/Bogleheads/MrMoneyMustache block scrapers (403).
// Accessible Investopedia pages are kept; rest replaced with Wikipedia.

const FINANCE_URLS = [
  // Investopedia — pages that allow scraping
  'https://www.investopedia.com/personal-finance-4427760',
  'https://www.investopedia.com/terms/e/emergency_fund.asp',
  'https://www.investopedia.com/terms/b/budget.asp',
  'https://www.investopedia.com/articles/personal-finance/100516/setting-financial-goals/',
  'https://www.investopedia.com/retirement/roth-vs-traditional-ira-which-is-right-for-you/',
  'https://www.investopedia.com/terms/1/401kplan.asp',
  'https://www.investopedia.com/terms/d/debtconsolidation.asp',
  'https://www.investopedia.com/terms/n/networth.asp',
  'https://www.investopedia.com/terms/t/taxbracket.asp',

  // Wikipedia — core finance & FIRE concepts (replacing blocked sources)
  'https://en.wikipedia.org/wiki/Compound_interest',
  'https://en.wikipedia.org/wiki/Index_fund',
  'https://en.wikipedia.org/wiki/Diversification_(finance)',
  'https://en.wikipedia.org/wiki/Inflation',
  'https://en.wikipedia.org/wiki/FIRE_movement',
  'https://en.wikipedia.org/wiki/Financial_independence',
  'https://en.wikipedia.org/wiki/Passive_management',
  'https://en.wikipedia.org/wiki/Safe_withdrawal_rate',
  'https://en.wikipedia.org/wiki/Net_worth',
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 RAG Agent — Seeding demo accounts\n')
  console.log(`Provider: ${LLM_PROVIDER}`)

  await ensureSchema()

  console.log('\nTesting embedding service...')
  try {
    await getEmbedding('test')
    console.log('  ✓ Embedding service OK')
  } catch (err) {
    console.error('  ✗ Embedding service failed:', err)
    console.error('    If using Ollama: ensure it is running and the embed model is pulled')
    console.error('    If using OpenAI: check OPENAI_API_KEY in .env.local')
    process.exit(1)
  }

  // Tenant 1: AI Agents Student
  console.log('\n📚 Tenant 1: AI Agents & Multi-Agent Systems')
  console.log('   student@demo.com / demo123456')
  const studentId = await ensureUser('student@demo.com', 'demo123456')
  await seedUserFromUrls(studentId, 'AI Agents & Multi-Agent Systems', AI_AGENTS_URLS)

  // Tenant 2: Personal Finance Investor
  console.log('\n📚 Tenant 2: Personal Finance & FIRE Movement')
  console.log('   investor@demo.com / demo123456')
  const investorId = await ensureUser('investor@demo.com', 'demo123456')
  await seedUserFromUrls(investorId, 'Personal Finance & FIRE Movement', FINANCE_URLS)

  console.log('\n✅ Seeding complete!\n')
  console.log('Demo credentials:')
  console.log('  student@demo.com  / demo123456  → AI Agents & Multi-Agent Systems')
  console.log('  investor@demo.com / demo123456  → Personal Finance & FIRE Movement\n')
}

main().catch(err => {
  console.error('\n✗ Seeding failed:', err)
  process.exit(1)
})
