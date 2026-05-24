# RAG Agent System

A production-ready, multi-tenant Retrieval-Augmented Generation (RAG) system built with Next.js, Supabase, and Ollama/OpenAI. Two pre-seeded demo accounts with distinct knowledge bases are included for immediate exploration.

**Live Demo:** [https://rag-agent-system.vercel.app](https://rag-agent-system.vercel.app) *(add your Vercel URL here)*

---

## Quick Start — Docker (Recommended)

The fastest way to run the full stack. Ollama, model pulls, and demo account seeding all happen automatically.

**Prerequisites:** Docker Desktop running, a Supabase project with migrations applied (see [Database Setup](#database-setup)).

```bash
git clone <your-repo-url>
cd RAG_Agent_System      # the repo root — docker-compose.yml lives here

cp .env.example .env
# Open .env and fill in three values:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY

docker compose up
# → Pulls ollama/ollama image, builds the Next.js image
# → On first run: downloads llama3.2:3b (~2GB) and all-minilm (~100MB)
# → Seeds demo accounts in the background (watch with: docker compose logs -f app)
# → App is live at http://localhost:3000
```

> **Model downloads happen once.** Ollama stores models in a named Docker volume (`ollama_data`) that persists across restarts. Subsequent `docker compose up` commands start in seconds.

### Demo Credentials

| Account | Email | Password | Domain |
|---------|-------|----------|--------|
| AI Agents Student | `student@demo.com` | `demo123456` | LangChain, LangGraph, LlamaIndex, CrewAI, agentic AI |
| Cooking for Beginners | `cooking@demo.com` | `demo123456` | Beginner cooking tips, techniques, recipes (r/cookingforbeginners) |

---

## Environment Variables

**Docker users:** copy `RAG_Agent_System/.env.example` → `RAG_Agent_System/.env`. `OLLAMA_BASE_URL` is set automatically by docker-compose — do not override it.

**Manual setup users:** copy `rag-agent/.env.example` → `rag-agent/.env.local`.

```bash
# Supabase (required — get from supabase.com → project settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-only admin key for seeding

# LLM Provider
LLM_PROVIDER=ollama                # "ollama" (default, free) | "openai" (cloud)

# Ollama — set automatically in Docker (http://ollama:11434)
# Override only for manual local setup
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=all-minilm

# OpenAI — only needed when LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_LLM_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small

# Seed endpoint protection (any random string)
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

### Database Setup

Required for both Docker and manual setups. Supabase is an external managed service.

1. Create a free project at [supabase.com](https://supabase.com)
2. Enable the `pgvector` extension: Dashboard → Database → Extensions → search "vector" → enable
3. Apply the three migrations **in order**:

```bash
# Option A: Supabase CLI (from the rag-agent/ directory)
supabase db push

# Option B: Manual — paste each file into Supabase Dashboard → SQL Editor
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
# supabase/migrations/003_functions.sql
```

4. Copy your project credentials into `.env` (or `.env.local` for manual setup):
   - Project URL and anon key: Dashboard → Settings → API
   - Service role key: Dashboard → Settings → API → Service role (keep secret)

---

### Option A: Docker (Recommended)

No local Node.js or Ollama installation needed.

```bash
# From the repo root (RAG_Agent_System/)
cp .env.example .env
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

docker compose up
```

What happens on first run:
- Ollama service starts and passes a health check
- `llama3.2:3b` (~2 GB) and `all-minilm` (~100 MB) are pulled automatically
- Demo accounts are seeded in the background (safe to use the app while this runs)
- App is live at **http://localhost:3000**

Watch seed progress:
```bash
docker compose logs -f app   # lines prefixed [seed]
```

Stop everything:
```bash
docker compose down          # keeps ollama_data volume (models stay downloaded)
docker compose down -v       # also removes the volume (re-downloads models next time)
```

---

### Option B: Manual Setup

For local development without Docker.

**Prerequisites:** Node.js 18+, Ollama installed from [ollama.ai](https://ollama.ai) OR an OpenAI API key.

```bash
# Pull required Ollama models (skip if using OpenAI)
ollama pull llama3.2:3b
ollama pull all-minilm
ollama pull llava:7b        # Optional: enables image ingestion

# From the rag-agent/ directory
cp .env.example .env.local
# Fill in Supabase credentials + set OLLAMA_BASE_URL=http://localhost:11434

npm install
npm run dev                  # Development server at http://localhost:3000
```

**Seed demo accounts** (run once, after the dev server is up for embedding):
```bash
npm run seed
```

This script:
- Creates `student@demo.com` (Next.js) and `cooking@demo.com` (Cooking for Beginners) via Supabase Auth
- Fetches Next.js docs URLs and popular posts from r/cookingforbeginners via Reddit's public JSON API
- Chunks, embeds, and indexes ~50k tokens of real content per user
- Is idempotent — reruns skip already-indexed URLs

**Expected time:** 15-30 minutes (network + embedding speed dependent)

---

## Project Structure

```
RAG_Agent_System/               ← repo root
├── docker-compose.yml          # Orchestrates app + ollama services
├── .env.example                # Copy to .env — fill in Supabase credentials
└── rag-agent/                  # Next.js application
    ├── Dockerfile              # Multi-step: install → build → entrypoint
    ├── docker/
    │   └── entrypoint.sh       # Waits for Ollama, pulls models, seeds, starts app
    ├── src/
    │   ├── app/
    │   │   ├── (app)/
    │   │   │   ├── chat/       # Chat interface
    │   │   │   └── admin/      # Admin panel
    │   │   ├── (auth)/
    │   │   │   └── login/      # Auth page
    │   │   └── api/
    │   │       ├── chat/       # Streaming RAG endpoint
    │   │       ├── ingest/     # Document ingestion
    │   │       └── seed/       # Seeding status check endpoint
    │   ├── components/
    │   │   ├── chat/           # ChatInterface, MessageItem, ChatSidebar
    │   │   ├── admin/          # UploadForm, DocumentTable, ConfigPanel
    │   │   └── ui/             # shadcn/ui components
    │   ├── lib/
    │   │   ├── llm/
    │   │   │   └── provider.ts # LLM abstraction (Ollama/OpenAI)
    │   │   ├── rag/
    │   │   │   ├── chunker.ts  # Semantic boundary chunker
    │   │   │   └── retriever.ts# Vector search + recommendations
    │   │   ├── ingest/
    │   │   │   ├── processor.ts        # Ingestion orchestrator
    │   │   │   ├── document-parser.ts  # PDF/DOCX/CSV parsing
    │   │   │   └── url-scraper.ts      # Web scraping (cheerio)
    │   │   ├── supabase/
    │   │   │   ├── client.ts   # Browser Supabase client
    │   │   │   └── server.ts   # Server Supabase client
    │   │   └── types.ts        # Shared TypeScript interfaces
    │   └── proxy.ts            # Auth middleware
    ├── supabase/
    │   └── migrations/
    │       ├── 001_initial_schema.sql  # Tables, indexes, triggers
    │       ├── 002_rls_policies.sql    # Row-Level Security policies
    │       └── 003_functions.sql       # match_chunks(), recommend_chunks()
    ├── scripts/
    │   └── seed.ts             # URL-based seeder: scrapes 45 docs, embeds, stores
    └── vercel.json             # Function timeout config
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

*Built with Next.js 16, Supabase, Vercel AI SDK, shadcn/ui, Ollama*
