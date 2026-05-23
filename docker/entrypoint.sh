#!/bin/sh
set -e

OLLAMA_URL="${OLLAMA_BASE_URL:-http://ollama:11434}"
LLM_MODEL="${OLLAMA_LLM_MODEL:-llama3.2:3b}"
EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

echo ""
echo "=============================================="
echo "  RAG Agent — Starting up"
echo "=============================================="
echo ""

# ── Validate required env vars ─────────────────────────────────────────────────
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ "$NEXT_PUBLIC_SUPABASE_URL" = "https://your-project.supabase.co" ]; then
  echo "❌ ERROR: NEXT_PUBLIC_SUPABASE_URL is not set."
  echo "   Copy .env.example → .env and fill in your Supabase credentials."
  exit 1
fi
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ "$SUPABASE_SERVICE_ROLE_KEY" = "your-service-role-key" ]; then
  echo "❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is not set."
  echo "   Copy .env.example → .env and fill in your Supabase credentials."
  exit 1
fi

# ── Wait for Ollama ────────────────────────────────────────────────────────────
echo "⏳ Waiting for Ollama at ${OLLAMA_URL}..."
until curl -sf "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; do
  sleep 2
done
echo "✓  Ollama is ready"
echo ""

# ── Pull models (idempotent — Ollama skips download if already cached) ─────────
pull_model() {
  MODEL=$1
  echo "📦 Pulling model: ${MODEL}"
  echo "   (already cached models complete instantly)"
  # stream=false makes the request synchronous — waits until pull is complete
  RESULT=$(curl -s -X POST "${OLLAMA_URL}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${MODEL}\",\"stream\":false}" \
    --max-time 600)
  STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | tail -1 | cut -d'"' -f4)
  echo "   ✓  ${MODEL} — ${STATUS:-done}"
  echo ""
}

pull_model "$LLM_MODEL"
pull_model "$EMBED_MODEL"

# ── Seed demo accounts in the background ──────────────────────────────────────
# The seed script is idempotent — it skips already-indexed URLs.
# Run it in background so the app is immediately available; watch progress
# via: docker compose logs -f app
(
  echo "[seed] 🌱 Starting seed script..."
  npx tsx scripts/seed.ts 2>&1 | sed 's/^/[seed] /'
  echo "[seed] ✅ Seed complete"
) &

# ── Start Next.js ──────────────────────────────────────────────────────────────
echo "🚀 Starting Next.js on http://localhost:3000"
echo ""
exec node_modules/.bin/next start
