# RAG Agent System

A production-ready, multi-tenant Retrieval-Augmented Generation (RAG) system built with Next.js, Supabase, and Ollama/OpenAI. Two pre-seeded demo accounts with distinct knowledge bases are included for immediate exploration.

**Live Demo:** [https://rag-agent-system.vercel.app](https://rag-agent-system.vercel.app) *(add your Vercel URL here)*

---

## Quick Start (< 5 minutes)

```bash
git clone <your-repo-url>
cd rag-agent
cp .env.example .env.local
# Fill in your Supabase and LLM credentials (see below)
npm install
npm run db:migrate     # Apply schema + RLS policies to Supabase
npm run seed           # Creates demo accounts + indexes ~100k tokens of content
npm run dev
# Navigate to http://localhost:3000
```

### Demo Credentials

| Account | Email | Password | Domain |
|---------|-------|----------|--------|
| Culinary Arts | `chef@demo.com` | `demo123456` | Professional cooking techniques, food science, culinary history |
| Personal Finance | `investor@demo.com` | `demo123456` | FIRE movement, investing, budgeting, tax strategy |

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Admin key for seed script only

# LLM Provider (choose one)
LLM_PROVIDER=ollama                # "ollama" for local | "openai" for production

# Ollama (if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2              # or mistral, phi3, etc.
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# OpenAI (if LLM_PROVIDER=openai)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Seed script secret (optional, protects /api/seed endpoint)
SEED_SECRET=your-secret-here
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                        │
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │  Chat UI     │   │  Admin Panel │   │   Auth (Supabase) │   │
│  │  /chat       │   │  /admin      │   │   /login          │   │
│  └──────┬───────┘   └──────┬───────┘   └───────────────────┘   │
│         │                   │                                     │
│  ┌──────▼───────────────────▼──────────────────────────────┐    │
│  │                    API Routes                             │    │
│  │  POST /api/chat    POST /api/ingest    POST /api/seed    │    │
│  └──────┬─────────────────┬──────────────────────────────┘    │
└─────────┼─────────────────┼──────────────────────────────────┘
          │                  │
  ┌───────▼──────┐   ┌──────▼──────────────────────────────┐
  │  LLM Layer   │   │           Supabase                   │
  │              │   │                                       │
  │  Ollama or   │   │  ┌─────────────┐  ┌──────────────┐ │
  │  OpenAI      │   │  │  pgvector   │  │  PostgreSQL  │ │
  │              │   │  │  (chunks)   │  │  (documents, │ │
  │  Streaming   │   │  │  IVFFlat    │  │  messages,   │ │
  │  responses   │   │  │  cosine     │  │  profiles)   │ │
  └──────────────┘   │  └─────────────┘  └──────────────┘ │
                     │                                       │
                     │  ┌─────────────────────────────────┐ │
                     │  │  Row-Level Security (RLS)        │ │
                     │  │  auth.uid() = user_id on all     │ │
                     │  │  tables — cross-tenant blocked   │ │
                     │  └─────────────────────────────────┘ │
                     └──────────────────────────────────────┘
```

### RAG Pipeline

```
User Query
    │
    ▼
┌─────────────────┐
│  Embed Query    │  nomic-embed-text (384-dim) or text-embedding-3-small
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Vector Search   │  match_chunks() SQL function
│ (pgvector)      │  WHERE user_id = auth.uid()   ← RLS enforcement
│ top_k=7         │  threshold=0.72, cosine sim
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Context Assembly│  Format: "[Source N: doc_title]\n{chunk_content}"
│ + Citations     │  Ordered by similarity score
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  LLM Inference  │  System prompt enforces grounding
│  (Streaming)    │  max_tokens=2048, temp=0.7
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Recommendations │  recommend_chunks() excludes already-cited docs
│ (Parallel)      │  Returns 3 related document suggestions
└────────┬────────┘
         │
         ▼
Stream response + X-Citations header + X-Recommendations header
```

---

## Technical Decisions

### Embedding Model

**Choice:** `nomic-embed-text` (Ollama) / `text-embedding-3-small` (OpenAI)
**Dimensions:** 384

**Rationale:**
- `nomic-embed-text` produces 768-dim vectors which we project to 384 — excellent quality/cost tradeoff at zero cost locally
- `text-embedding-3-small` at 384 dimensions via OpenAI's Matryoshka reduction gives near-equivalent quality to ada-002 at 5x lower cost
- 384 dimensions reduces storage (vs 1536) while maintaining good semantic discrimination
- IVFFlat index performs well at this dimensionality with small-medium datasets

**Alternatives considered:**
- `all-MiniLM-L6-v2` (384-dim, faster but weaker on domain knowledge)
- `text-embedding-ada-002` (1536-dim, costlier, no improvement at this scale)
- BAAI/bge-small-en (384-dim, strong alternative but less available in Ollama)

**Production considerations:** At 100K+ users, evaluate switching to Cohere Embed v3 for multilingual support or fine-tuned domain embeddings.

---

### LLM Configuration

**Choice:** `llama3.2` (Ollama) / `gpt-4o-mini` (OpenAI)
**Temperature:** 0.7 (balanced factuality vs natural language flow)
**Max tokens:** 2048

**Rationale:**
- `llama3.2` (3B) runs comfortably on consumer hardware with 4-8GB RAM, adequate context for RAG (8192 tokens)
- `gpt-4o-mini` gives production-grade quality at ~$0.15/1M tokens — cost-effective for demos
- Temperature 0.7: low enough to stay grounded in retrieved context, high enough to avoid robotic phrasing
- 2048 output tokens: sufficient for detailed explanations + citations without hitting context limits

**Streaming implementation:** Vercel AI SDK `streamText()` → `toTextStreamResponse()`. Citations and recommendations are sent as custom response headers (`X-Citations`, `X-Recommendations`) before the body stream begins, enabling the client to render citations immediately.

**Function calling:** Not used for v1 — direct prompting with context injection is simpler and adequate. Would add tool use for multi-hop reasoning at v2.

---

### Chunking Strategy

**Method:** Semantic boundary chunking (paragraph-aware)
**Target size:** 400 tokens
**Overlap:** 20 tokens
**Tokenizer:** Approximation (~4 chars/token, cl100k_base compatible)

**Rationale:**
- Paragraph boundaries preserve semantic coherence — a chunk never cuts mid-sentence or mid-idea
- 400 tokens gives enough context for the LLM to understand each chunk independently
- 20-token overlap ensures no information is lost at chunk boundaries
- This range (300-500 tokens) consistently outperforms both smaller (too little context) and larger (too much noise) chunks in retrieval precision

**Special cases:**
- **PDFs:** pdf-parse extracts text with layout; double newlines signal paragraph boundaries
- **DOCX:** mammoth converts to plain text preserving paragraph structure
- **CSV:** Converted to prose format ("Column: value") before chunking — tabular data chunked as rows
- **Code:** Treated as text; future v2 would use tree-sitter AST boundaries
- **Images:** Passed through vision LLM to generate a text description, then chunked normally
- **URLs:** Scraped with cheerio, boilerplate stripped (nav, ads, footers), semantic boundaries detected

---

### Retrieval Pipeline

**Method:** Single-stage semantic retrieval
**top_k:** 7
**Similarity threshold:** 0.72 (cosine)
**Metric:** Cosine similarity (normalized dot product)
**Reranking:** None (v1)

**Rationale:**
- top_k=7 balances context richness (enough evidence for good answers) vs prompt bloat (too many chunks dilute signal)
- Threshold 0.72 eliminates clearly irrelevant results while being permissive enough for varied phrasings
- Cosine similarity is superior to L2 distance for semantic search — magnitude-independent
- Single-stage is sufficient for this dataset size; two-stage (retrieve 20 → rerank to 7) would add value at 100K+ documents

**Ambiguous queries:** System prompt instructs the LLM to acknowledge uncertainty and ask clarifying questions rather than hallucinate

**Multi-hop:** Not explicitly supported in v1 — the LLM can synthesize across multiple retrieved chunks but doesn't decompose queries. Future: LangGraph-style agentic retrieval loop.

---

### Vector Store Design

**Technology:** pgvector (Supabase)
**Index:** IVFFlat with 100 lists, `ivfflat.probes=10`
**Distance:** Cosine (`vector_cosine_ops`)
**Multi-tenancy:** `user_id` column + RLS policies

**Rationale:**
- pgvector in Supabase eliminates a separate vector DB dependency — one less moving part
- IVFFlat provides approximate nearest-neighbor search with good performance at 10K-1M vectors
- 100 lists is appropriate for datasets up to ~1M vectors (rule: `sqrt(n_vectors)`)
- Cosine is preferred over inner product when vector magnitudes vary (they do post-normalization)

**Query performance:**
- Cold query: ~100-200ms (includes embedding + vector search)
- Warm query: ~50-100ms (Postgres cache warm)
- At 1M vectors: consider HNSW index (pgvector 0.5+) for better recall/speed tradeoff

**Scaling:**
- 1K users: current setup handles comfortably
- 100K users: partition `chunks` table by `user_id` hash range, or separate Supabase projects per tenant tier
- 1M users: dedicated vector DB (Pinecone/Weaviate) with Postgres as metadata store

---

### Multi-Tenant Isolation

**Strategy:** Defense in depth — three enforcement layers

```
Layer 1: PostgreSQL RLS (Database)
  ─ All tables have: auth.uid() = user_id
  ─ Applied automatically to all queries through Supabase client
  ─ Cannot be bypassed by application code bugs

Layer 2: SQL Function Filter (Vector Search)
  ─ match_chunks(query_embedding, match_user_id, ...)
  ─ Explicit WHERE user_id = match_user_id in function body
  ─ Even if RLS is misconfigured, function still filters

Layer 3: API Middleware (Application)
  ─ proxy.ts validates JWT and extracts user_id
  ─ user_id from JWT is passed to all retrieval functions
  ─ Client cannot supply a different user_id
```

**Threat model:**
- **Injection via query:** User cannot inject SQL through the chat query — it's embedded and passed as a parameter to the RPC function
- **JWT manipulation:** Supabase validates JWT signatures server-side; user_id is extracted from verified payload
- **Vector bleeding:** IVFFlat index is shared (performance) but RLS ensures query results are filtered — no chunk returned unless `user_id` matches
- **Privilege escalation:** Service role key is server-only (never sent to client); anon key + RLS enforces user isolation

**Verification approach:**
1. Log in as tenant A, retrieve 5 documents
2. Log in as tenant B, attempt to query with tenant A's user_id embedded in request — middleware rejects
3. Direct Supabase query as anon with tenant A's JWT → returns only tenant A's data

---

### Recommendations Engine

**Approach:** Semantic similarity to current conversation context, excluding already-cited documents

```
Current context → embed → recommend_chunks() SQL function
  WHERE user_id = auth.uid()
  AND document_id NOT IN (already_cited_doc_ids)
  ORDER BY similarity DESC
  LIMIT 3
```

**Result:** Grouped by document, returns 3 distinct documents the user hasn't seen yet, ordered by relevance to current topic.

**Rationale:**
- Semantic approach naturally surfaces topically related content regardless of exact phrasing
- Excluding already-cited docs prevents circular recommendations
- Grouping by document (not chunk) gives cleaner UX — one recommendation per topic area
- Future: add metadata signals (difficulty, prerequisites, sequence numbers) for more structured recommendations

---

## Ingestion Pipeline

Supports 4 source types:

| Source | Processing |
|--------|-----------|
| **Document** (PDF, DOCX, TXT, MD, CSV) | Parse → extract text → semantic chunk → embed → store |
| **URL** | Fetch → cheerio scrape (no JS rendering) → strip boilerplate → chunk → embed → store |
| **Image** (PNG, JPG, WebP, GIF) | Upload to Supabase Storage → vision LLM → text description → chunk → embed → store |
| **Raw text** | Direct chunk → embed → store |

**Synchronous processing:** Documents are processed inline during the API request (max 60s on Vercel). For large documents (>200 pages), consider breaking into background jobs.

**Idempotency:** Seed script checks for existing documents by title — won't re-index if already present.

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Ollama installed locally OR OpenAI API key

### With Ollama (Free, Local)

```bash
# Install Ollama from https://ollama.ai
ollama pull llama3.2          # Chat model
ollama pull nomic-embed-text  # Embedding model
ollama pull llava              # Optional: image description
```

### Without Ollama (OpenAI)

Set `LLM_PROVIDER=openai` and provide `OPENAI_API_KEY` in `.env.local`. No other changes needed.

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Enable the `pgvector` extension in Supabase Dashboard → Database → Extensions
3. Run migrations:

```bash
# Option A: Supabase CLI
supabase db push

# Option B: Manual — paste each file into Supabase SQL Editor
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
# supabase/migrations/003_functions.sql
```

### Seed Demo Accounts

```bash
npm run seed
```

This script:
- Creates `chef@demo.com` and `investor@demo.com` via Supabase Admin API
- Reads 20 markdown documents per domain from `scripts/seed-data/`
- Chunks, embeds, and indexes ~100k tokens of content
- Is idempotent — safe to run multiple times

**Expected time:** 5-15 minutes depending on embedding speed (Ollama local vs OpenAI API)

---

## Project Structure

```
rag-agent/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── chat/          # Chat interface
│   │   │   └── admin/         # Admin panel
│   │   ├── (auth)/
│   │   │   └── login/         # Auth page
│   │   └── api/
│   │       ├── chat/          # Streaming RAG endpoint
│   │       ├── ingest/        # Document ingestion
│   │       └── seed/          # Demo account seeding
│   ├── components/
│   │   ├── chat/              # ChatInterface, MessageBubble, Citations
│   │   ├── admin/             # UploadForm, DocumentList, ConfigPanel
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── llm/
│   │   │   └── provider.ts    # LLM abstraction (Ollama/OpenAI)
│   │   ├── rag/
│   │   │   ├── chunker.ts     # Semantic boundary chunker
│   │   │   └── retriever.ts   # Vector search + recommendations
│   │   ├── ingest/
│   │   │   ├── processor.ts   # Ingestion orchestrator
│   │   │   ├── document-parser.ts  # PDF/DOCX/CSV parsing
│   │   │   └── url-scraper.ts # Web scraping
│   │   ├── supabase/
│   │   │   ├── client.ts      # Browser client
│   │   │   └── server.ts      # Server client
│   │   └── types.ts           # Shared TypeScript interfaces
│   └── proxy.ts               # Auth middleware (Next.js 16)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       └── 003_functions.sql
├── scripts/
│   ├── seed.ts                # Demo account seeder
│   └── seed-data/
│       ├── culinary/          # 20 culinary arts documents
│       └── finance/           # 20 personal finance documents
└── vercel.json                # Function timeout config
```

---

## Known Limitations & Future Improvements

### Current Limitations

- **No async ingestion:** Large files (>100 pages) may timeout on Vercel's 60s limit
- **URL scraping:** cheerio can't execute JavaScript — SPAs and dynamic content won't scrape well
- **No conversation persistence across sessions:** Chat history resets on page reload
- **Single retrieval stage:** No reranking (cross-encoder) for precision improvement

### What's Next

**Retrieval Quality:**
- Two-stage retrieval: retrieve 20 → cross-encoder rerank → top 7
- Hybrid search: pgvector semantic + PostgreSQL full-text search (tsvector/tsquery)
- Query decomposition for multi-part questions
- HyDE (Hypothetical Document Embeddings) for better query-document matching

**Infrastructure:**
- Background job queue (Supabase pg_cron or Inngest) for async ingestion
- Redis cache for repeated queries
- Rate limiting per tenant (Upstash)
- Horizontal scaling: read replicas for vector search

**Evaluation:**
- Golden question sets per domain with expected answers
- Automated metrics: faithfulness (RAGAS), relevance, coherence
- Retrieval precision/recall dashboard
- A/B testing framework for chunking parameters

**UX:**
- Persistent conversation history (save to DB, reload on visit)
- Follow-up question suggestions
- Citation hover-preview (show chunk context inline)
- Export conversations (Markdown, PDF)
- Feedback loop (thumbs up/down on responses)

---

## Scaling Considerations

| Scale | Changes Needed |
|-------|---------------|
| 100 users | Current architecture handles fine |
| 10K users | Add Redis query cache, read replicas |
| 100K users | Dedicated vector DB (Pinecone), separate Supabase projects per enterprise tenant |
| 1M users | Horizontal sharding, async pipeline with Kafka, CDN for static assets |

---

## Security

- **RLS** enforced at PostgreSQL level — no cross-tenant data access possible
- **JWT validation** server-side via Supabase; user_id extracted from verified token
- **No SQL injection** possible — all queries use parameterized RPC functions
- **XSS protection** — React escapes output; no dangerouslySetInnerHTML
- **Secrets** — service role key is server-only, never exposed to client
- **Input validation** — file type, size, and content validation before processing

---

*Built with Next.js 15, Supabase, Vercel AI SDK, shadcn/ui*
