-- Add agent configuration fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_persona text DEFAULT 'helpful_assistant',
  ADD COLUMN IF NOT EXISTS llm_provider text DEFAULT 'ollama',
  ADD COLUMN IF NOT EXISTS max_tokens int DEFAULT 2048 CHECK (max_tokens > 0 AND max_tokens <= 8192),
  ADD COLUMN IF NOT EXISTS enable_citations boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_streaming boolean DEFAULT true;
