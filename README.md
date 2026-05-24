# RAG Agent System

A production-ready, multi-tenant Retrieval-Augmented Generation (RAG) system built with Next.js, Supabase, and Ollama/OpenAI. Two pre-seeded demo accounts with distinct knowledge bases are included for immediate exploration.

**Live Demo:** [https://rag-conversational-agent.vercel.app](https://rag-conversational-agent.vercel.app)

---

## Quick Start — Docker (Recommended)

The fastest way to run the full stack. Ollama, model pulls, and demo account seeding all happen automatically.

**Prerequisites:** Docker Desktop running, a Supabase project with migrations applied (see [Database Setup](#database-setup)).

```bash
git clone https://github.com/omerdor001/RAG_Conversational_Agent.git
cd RAG_Agent_System      # the repo root — docker-compose.yml lives here

cp .env.example .env
# Open .env and fill in three values:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY

docker compose up
# → Pulls ollama/ollama image, builds the Next.js image
# → On first run: downloads llama3.2:3b (~2GB) and nomic-embed-text (~300MB)
# → Seeds demo accounts in the background (watch with: docker compose logs -f app)
# → App is live at http://localhost:3000
```

> **Model downloads happen once.** Ollama stores models in a named Docker volume (`ollama_data`) that persists across restarts. Subsequent `docker compose up` commands start in seconds.

### Demo Credentials

| Account | Email | Password | Domain |
|---------|-------|----------|--------|
| Next.js App Router | `student@demo.com` | `demo123456` | Next.js App Router docs — routing, data fetching, rendering, API routes |
| Cooking for Beginners | `cooking@demo.com` | `demo123456` | Beginner cooking tips, techniques, recipes (r/cookingforbeginners) |

---

## Knowledge Bases

### Why these two domains?

The domains were chosen to be maximally distinguishable — a reviewer can immediately tell whether cross-tenant isolation is working because the same question produces completely different results (or explicit "I don't know") across the two accounts.

| Criterion | Next.js App Router docs | r/cookingforbeginners |
|-----------|------------------------|-----------------------|
| **Content type** | Official technical documentation | Community Q&A / discussion posts |
| **Vocabulary** | Framework-specific (`middleware`, `RSC`, `revalidatePath`) | Culinary (`mise en place`, `fond`, `caramelise`) |
| **Overlap risk** | Near-zero — no cooking terms in Next.js docs | Near-zero — no web framework terms in cooking posts |
| **Token volume** | ~30 pages × ~1–2k tokens each ≈ 50k+ tokens | Top/hot posts + top comments until 50k token target |
| **Retrieval challenge** | Exact API lookups + conceptual explanations | Practical how-to questions with community nuance |

---

### Knowledge Base 1 — Next.js App Router Documentation (`student@demo.com`)

**Source:** Official [nextjs.org/docs/app](https://nextjs.org/docs/app) pages, scraped directly.

**Why Next.js documentation?**
- It is a real, stable, publicly available corpus — no synthetic or low-quality content.
- App Router introduced breaking API changes over Pages Router, so retrieval has genuine value: a developer asking "how do I fetch data?" needs a grounded answer, not a hallucination mixing old and new APIs.
- The content is dense with code examples and cross-references, which exercises citation quality and chunking strategy.
- Queries are naturally precise ("what does `use server` do?") making it easy to verify retrieval correctness.

**Content coverage (~30 pages):**
- Getting Started: installation, project structure, layouts/pages, linking/navigating, Server & Client Components, data fetching, mutations, caching, error handling, deploying
- Guides: authentication, environment variables, forms, redirects, streaming, self-hosting, production checklist, static exports
- API Reference: `<Image>`, `<Link>`, file conventions (`layout`, `page`, `route`, `error`, dynamic routes), core functions (`cookies`, `headers`, `redirect`, `useRouter`, `revalidatePath`)

**Agent persona:** "You are a Next.js expert specialising in the App Router. Answer questions based strictly on the provided documentation context, cite specific pages and sections, explain concepts with code examples where relevant."

---

### Knowledge Base 2 — Cooking for Beginners (`cooking@demo.com`)

**Source:** Top-all-time and hot posts from [r/cookingforbeginners](https://www.reddit.com/r/cookingforbeginners/) via Reddit's public JSON API, enriched with the top 12 upvoted comments per post.

**Why r/cookingforbeginners?**
- Community-driven content captures the kind of practical, experience-backed knowledge that formal recipes miss: why a technique works, common beginner mistakes, equipment substitutions, shopping tips.
- The conversational tone means queries like "my onions never brown right" or "how do I not ruin pasta" have genuinely useful answers in the corpus — realistic use-case testing.
- Posts and comments together create multi-perspective documents: one post may contain 5 different users explaining the same technique, giving the retriever rich signal for nuanced queries.
- Reddit's public JSON API requires no authentication and is rate-limit friendly, keeping the seed script simple and reproducible.

**Content coverage (~50k tokens):**
- Knife skills, heat control, seasoning fundamentals
- Common beginner mistakes (overcrowding pans, not patting meat dry, oversalting)
- Equipment basics (when a cast iron matters, pan types, essential vs. luxury tools)
- Ingredient handling (garlic, onions, stock, pasta water, fats)
- Practical questions ("what to cook first", "how to read a recipe", "pantry staples")
- Community Q&A enriched with upvoted replies providing multiple angles on each topic

**Agent persona:** "You are a friendly cooking assistant for beginners, drawing on popular posts and community wisdom from r/cookingforbeginners. Give practical tips, explain techniques clearly, and suggest next steps."

---

## LLM Provider Choice

> **OpenAI is the default** — and intentionally so.

| Provider | Local dev | Vercel (production) | Cost |
|----------|-----------|---------------------|------|
| **OpenAI** (default) | ✅ Works | ✅ Works | ~$0.15/1M tokens |
| **Ollama** | ✅ Works | ❌ Not supported | Free |

Ollama requires a persistent local process and is **incompatible with Vercel's serverless environment** — functions are stateless and cannot reach a locally running Ollama daemon. OpenAI works in both contexts, making it the right default for a system that is developed locally and deployed on Vercel.

Use Ollama only if you are running the app **exclusively via Docker locally** and do not intend to deploy to Vercel.

---

## Environment Variables

**Docker users:** copy `RAG_Agent_System/.env.example` → `RAG_Agent_System/.env`. `OLLAMA_BASE_URL` is set automatically by docker-compose — do not override it.

**Manual setup users:** copy `rag-agent/.env.example` → `rag-agent/.env.local`.

```bash
# Supabase (required — get from supabase.com → project settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-only admin key for seeding
DATABASE_URL=postgresql://...      # Optional: for auto-migrations via seed script

# LLM Provider — OpenAI is the default (works locally AND on Vercel)
# Use "ollama" only for local Docker runs — Ollama cannot run on Vercel serverless
LLM_PROVIDER=openai                # "openai" (default) | "ollama" (local Docker only)
EMBED_PROVIDER=                    # Optional: decouple embedding provider from LLM provider

# Ollama — set automatically in Docker (http://ollama:11434)
# Override only for manual local setup
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_VISION_MODEL=llava:7b       # Optional: enables image ingestion

# OpenAI — only needed when LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_LLM_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small

# Seed endpoint protection (any random string)
SEED_SECRET=your-secret-here

# Optional: Jina Reader API key for JS-rendered site fallback during URL scraping
JINA_API_KEY=
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
  │  Streaming   │   │  │  HNSW       │  │  messages,   │ │
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
│  Embed Query    │  nomic-embed-text (768-dim) or text-embedding-3-small
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Hybrid Search   │  hybrid_search() SQL function (70% vector + 30% keyword)
│ (pgvector +     │  WHERE user_id = auth.uid()   ← RLS enforcement
│  full-text)     │  top_k=7, threshold=0.3, cosine sim
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Context Assembly│  Format: "[Source N: doc_title]\n{chunk_content}"
│ + Citations     │  Ordered by similarity score, deduped by document_id
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  LLM Inference  │  System prompt enforces grounding
│  (Streaming)    │  max_tokens configurable (512 default), temp configurable
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Recommendations │  recommend_chunks() excludes already-cited docs
│ (Parallel)      │  threshold=0.40, returns 3 related document suggestions
└────────┬────────┘
         │
         ▼
Stream response + X-Citations header + X-Recommendations header
```

---

## Technical Decisions

### Embedding Model

**Choice:** `nomic-embed-text` (Ollama) / `text-embedding-3-small` (OpenAI)
**Dimensions:** 768

**Rationale:**
- `nomic-embed-text` produces native 768-dim vectors — strong semantic quality with 8192-token context window at zero cost locally
- `text-embedding-3-small` at 768 dimensions via OpenAI gives near-equivalent quality to ada-002 at lower cost
- 768 dimensions provides better semantic discrimination than 384 without the storage overhead of 1536
- HNSW index performs efficiently at this dimensionality across small-to-large datasets

**Alternatives considered:**
- `all-MiniLM-L6-v2` (384-dim, faster but weaker domain knowledge)
- `text-embedding-ada-002` (1536-dim, costlier, no improvement at this scale)
- BAAI/bge-small-en (384-dim, strong alternative but less available in Ollama)

**Production considerations:** At 100K+ users, evaluate switching to Cohere Embed v3 for multilingual support or fine-tuned domain embeddings.

---

### LLM Configuration

**Default:** `gpt-4o-mini` (OpenAI) — works locally and on Vercel
**Alternative:** `llama3.2:3b` (Ollama) — local Docker only, free
**Temperature:** Configurable per user profile
**Max tokens:** Configurable per user profile (512 default)

**Why OpenAI is the default:**
Vercel's serverless functions are stateless — they cannot reach a locally running Ollama process. OpenAI is an external HTTP API that works identically in local dev, Docker, and Vercel production. Ollama is offered as an alternative for cost-free local-only setups via Docker.

**Rationale:**
- `gpt-4o-mini` gives production-grade quality at ~$0.15/1M tokens — cost-effective for cloud deployment and demo use
- `llama3.2:3b` runs comfortably on consumer hardware with 4-8GB RAM, adequate context for RAG (8192 tokens)
- Temperature is user-configurable so tenants can tune for their domain (factual vs. creative)
- 512 output tokens is the conservative default; users can raise it for longer answers

**Streaming implementation:** Vercel AI SDK `streamText()` → `ReadableStream` as `text/plain`. Citations and recommendations are sent as custom response headers (`X-Citations`, `X-Recommendations`, `X-Out-Of-Scope`) before the body stream begins, enabling the client to render citations immediately.

**Function calling:** Not used for v1 — direct prompting with context injection is simpler and adequate. Would add tool use for multi-hop reasoning at v2.

---

### Chunking Strategy

**Method:** Semantic boundary chunking (paragraph-aware, then sentence-level fallback)
**Target size:** 300 tokens
**Overlap:** 20 tokens
**Tokenizer:** Approximation (~4 chars/token, cl100k_base compatible)

**Rationale:**
- Paragraph boundaries preserve semantic coherence — a chunk never cuts mid-sentence or mid-idea
- 300 tokens gives enough context for the LLM to understand each chunk independently while keeping retrieval precise
- 20-token overlap (~80 chars, word-boundary aware) ensures no information is lost at chunk boundaries
- This range (250-350 tokens) consistently outperforms both smaller (too little context) and larger (too much noise) chunks in retrieval precision

**Special cases:**
- **PDFs:** pdf-parse extracts text with layout; double newlines signal paragraph boundaries
- **DOCX:** mammoth converts to plain text preserving paragraph structure
- **CSV:** Converted to prose format ("Column: value") before chunking — tabular data chunked as rows
- **TXT/MD:** UTF-8 decoded directly
- **Images:** Vision LLM (llava:7b) generates a text description, then chunked normally
- **URLs:** Scraped with cheerio, boilerplate stripped (nav, ads, footers); Jina Reader fallback for JS-rendered pages

---

### Retrieval Pipeline

**Method:** Hybrid search (semantic vector + full-text keyword, 70%/30% weighted)
**top_k:** 7 (configurable per user profile)
**Similarity threshold:** 0.3 (configurable per user profile, lowered for better recall)
**Recommendation threshold:** 0.40 (hardcoded floor in SQL function)
**Metric:** Cosine similarity (normalized dot product)
**Reranking:** None (v1)

**Rationale:**
- Hybrid search combines semantic understanding (vector) with keyword precision (tsvector/tsquery) — reduces missed retrievals for exact-term queries
- top_k=7 balances context richness vs prompt bloat
- Threshold 0.3 is deliberately permissive — the LLM prompt instructs grounding so low-similarity noise doesn't hallucinate answers
- Cosine similarity is superior to L2 distance for semantic search — magnitude-independent
- Single-stage retrieval is sufficient for this dataset size; two-stage (retrieve 20 → rerank to 7) would add value at 100K+ documents

**Ambiguous queries:** System prompt instructs the LLM to acknowledge uncertainty and ask clarifying questions rather than hallucinate.

**Multi-hop:** Not explicitly supported in v1 — the LLM synthesizes across multiple retrieved chunks but doesn't decompose queries. Future: LangGraph-style agentic retrieval loop.

---

### Vector Store Design

**Technology:** pgvector (Supabase)
**Index:** HNSW (`m=16, ef_construction=64`)
**Distance:** Cosine (`vector_cosine_ops`)
**Dimensions:** 768
**Multi-tenancy:** `user_id` column + RLS policies

**Rationale:**
- pgvector in Supabase eliminates a separate vector DB dependency — one less moving part
- HNSW provides better recall/speed tradeoff than IVFFlat, especially at low query counts; no training phase required
- `m=16, ef_construction=64` gives a good balance between index build time and query recall
- Cosine is preferred over inner product when vector magnitudes vary

**Query performance:**
- Cold query: ~100-200ms (includes embedding + vector search)
- Warm query: ~50-100ms (Postgres cache warm)
- At 1M vectors: tune `ef_search` parameter and consider partitioning

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
  ─ hybrid_search(query_text, query_embedding, match_user_id, ...)
  ─ Explicit WHERE user_id = match_user_id in function body
  ─ Even if RLS is misconfigured, function still filters

Layer 3: API Middleware (Application)
  ─ middleware.ts validates JWT and extracts user_id
  ─ user_id from JWT is passed to all retrieval functions
  ─ Client cannot supply a different user_id
```

**Threat model:**
- **Injection via query:** User cannot inject SQL through the chat query — it's embedded and passed as a parameter to the RPC function
- **JWT manipulation:** Supabase validates JWT signatures server-side; user_id is extracted from verified payload
- **Vector bleeding:** HNSW index is shared (performance) but RLS + function-level filtering ensures query results are scoped — no chunk returned unless `user_id` matches
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
  AND similarity >= 0.40
  ORDER BY similarity DESC
  LIMIT 3
```

**Result:** Grouped by document (deduped by `document_id` + title), returns 3 distinct documents the user hasn't seen yet, ordered by relevance to current topic.

**Rationale:**
- Semantic approach naturally surfaces topically related content regardless of exact phrasing
- Excluding already-cited docs prevents circular recommendations
- Over-fetches `count * 2` candidates then deduplicates, ensuring quality even with sparse knowledge bases
- Future: add metadata signals (difficulty, prerequisites, sequence numbers) for more structured recommendations

---

## Ingestion Pipeline

Supports 4 source types:

| Source | Processing |
|--------|-----------|
| **Document** (PDF, DOCX, DOC, TXT, MD, CSV) | Parse → extract text → semantic chunk → embed → store |
| **URL** | Fetch → cheerio scrape → Jina Reader fallback (JS sites) → strip boilerplate → chunk → embed → store |
| **Image** (PNG, JPG, WebP, GIF) | Upload to Supabase Storage → vision LLM (llava:7b) → text description → chunk → embed → store |
| **Raw text** | Direct chunk → embed → store |

**Synchronous processing:** Documents are processed inline during the API request. Vercel timeout for `/api/ingest` is 60 seconds.

**Batching:** Embeddings are generated in batches of 5 chunks (rate limit / memory safety); chunks are inserted into the DB in batches of 50 (Supabase 1 MB payload limit).

**Document status flow:** `pending` → `indexing` → `indexed` (or `failed`)

**Idempotency:** Seed script checks for existing embeddings by URL — won't re-index if already present.

---

## Setup Instructions

### Database Setup

Required for both Docker and manual setups. Supabase is an external managed service.

1. Create a free project at [supabase.com](https://supabase.com)
2. Enable the `pgvector` extension: Dashboard → Database → Extensions → search "vector" → enable
3. Apply all 9 migrations **in order**:

```bash
# Option A: Supabase CLI (from the rag-agent/ directory)
supabase db push

# Option B: Manual — paste each file into Supabase Dashboard → SQL Editor
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
# supabase/migrations/003_functions.sql
# supabase/migrations/004_resize_embeddings.sql
# supabase/migrations/005_fix_thresholds.sql
# supabase/migrations/006_hnsw_index.sql
# supabase/migrations/007_keyword_search.sql
# supabase/migrations/008_agent_config.sql
# supabase/migrations/009_profile_role.sql
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
- `llama3.2:3b` (~2 GB) and `nomic-embed-text` (~300 MB) are pulled automatically
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
ollama pull nomic-embed-text
ollama pull llava:7b        # Optional: enables image ingestion

# From the rag-agent/ directory
cp .env.example .env.local
# Fill in Supabase credentials + set LLM_PROVIDER=ollama + OLLAMA_BASE_URL=http://localhost:11434

npm install
npm run dev                  # Development server at http://localhost:3000
```

**Seed demo accounts** (run once, after the dev server is up for embedding):
```bash
npm run seed
```

This script:
- Creates `student@demo.com` (Next.js App Router) and `cooking@demo.com` (Cooking for Beginners) via Supabase Auth
- Fetches ~25 Next.js official documentation pages from nextjs.org/docs/app
- Fetches popular posts from r/cookingforbeginners via Reddit's public JSON API (top + hot posts with comments)
- Chunks, embeds, and indexes ~50k tokens of real content per user
- Is idempotent — reruns skip already-indexed URLs (checks for non-null embeddings)
- Rate-limited: 1.5s between URL scrapes, 1s between Reddit API calls

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
    │   │   │   ├── chat/           # Chat interface
    │   │   │   ├── admin/          # Admin panel
    │   │   │   └── embed-demo/     # Embedding visualization
    │   │   ├── (auth)/
    │   │   │   ├── login/          # Login page
    │   │   │   └── register/       # Registration page
    │   │   └── api/
    │   │       ├── chat/           # Streaming RAG endpoint (300s timeout)
    │   │       ├── ingest/         # Document ingestion (60s timeout)
    │   │       ├── config/         # User profile configuration
    │   │       ├── conversations/  # List/create/delete conversations
    │   │       │   └── [id]/
    │   │       ├── documents/      # Document management
    │   │       │   └── [id]/
    │   │       ├── ollama/         # Local model management
    │   │       │   ├── models/
    │   │       │   └── pull/
    │   │       ├── seed/           # Demo account seeding status
    │   │       └── debug/search/   # Development: test vector search
    │   ├── components/
    │   │   ├── chat/           # ChatInterface, MessageItem, ChatSidebar
    │   │   ├── admin/          # UploadForm, DocumentTable, ConfigPanel
    │   │   └── ui/             # shadcn/ui components
    │   ├── lib/
    │   │   ├── llm/
    │   │   │   └── provider.ts # LLM abstraction (Ollama/OpenAI)
    │   │   ├── rag/
    │   │   │   ├── chunker.ts  # Semantic boundary chunker (300 tokens, 20 overlap)
    │   │   │   └── retriever.ts# Hybrid search + recommendations
    │   │   ├── ingest/
    │   │   │   ├── processor.ts        # Ingestion orchestrator
    │   │   │   ├── document-parser.ts  # PDF/DOCX/CSV parsing
    │   │   │   └── url-scraper.ts      # Cheerio + Jina Reader fallback
    │   │   ├── supabase/
    │   │   │   ├── client.ts   # Browser Supabase client
    │   │   │   └── server.ts   # Server Supabase client
    │   │   └── types.ts        # Shared TypeScript interfaces
    │   └── middleware.ts       # Auth middleware (JWT validation)
    ├── supabase/
    │   └── migrations/
    │       ├── 001_initial_schema.sql  # Tables, indexes, triggers
    │       ├── 002_rls_policies.sql    # Row-Level Security policies
    │       ├── 003_functions.sql       # match_chunks(), recommend_chunks()
    │       ├── 004_resize_embeddings.sql  # 384-dim → 768-dim for nomic-embed-text
    │       ├── 005_fix_thresholds.sql  # Lower thresholds (0.5→0.3, 0.6→0.4)
    │       ├── 006_hnsw_index.sql      # Replace IVFFlat with HNSW
    │       ├── 007_keyword_search.sql  # Full-text search + hybrid_search()
    │       ├── 008_agent_config.sql    # Per-tenant agent config fields
    │       └── 009_profile_role.sql    # Domain/subject role field
    ├── scripts/
    │   └── seed.ts             # URL-based seeder: scrapes docs/reddit, embeds, stores
    └── vercel.json             # Function timeout config (chat: 300s, ingest: 60s)
```

---

## Known Limitations & Future Improvements

### Current Limitations

- **No async ingestion:** Large files may timeout on Vercel's 60s limit for `/api/ingest`
- **URL scraping:** cheerio can't execute JavaScript — Jina Reader fallback handles some JS sites but not all
- **No conversation persistence across sessions:** Chat history resets on page reload
- **Single retrieval stage:** No cross-encoder reranking for precision improvement

### What's Next

**Retrieval Quality:**
- Two-stage retrieval: retrieve 20 → cross-encoder rerank → top 7
- Query decomposition for multi-part questions
- HyDE (Hypothetical Document Embeddings) for better query-document matching
- Tune hybrid search weights (currently 70/30) per domain

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
