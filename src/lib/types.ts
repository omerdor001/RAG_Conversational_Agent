export type SourceType = 'document' | 'url' | 'text'
export type DocumentStatus = 'pending' | 'indexing' | 'indexed' | 'failed'
export type MessageRole = 'user' | 'assistant'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: string | null
  system_prompt: string
  temperature: number
  top_k: number
  similarity_threshold: number
  llm_model: string
  agent_persona: string
  llm_provider: string
  max_tokens: number
  enable_citations: boolean
  enable_streaming: boolean
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  title: string
  source_type: SourceType
  source_url: string | null
  file_type: string | null
  raw_content: string | null
  status: DocumentStatus
  error_message: string | null
  chunk_count: number
  token_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Chunk {
  id: string
  user_id: string
  document_id: string
  content: string
  chunk_index: number
  token_count: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface MatchedChunk {
  id: string
  document_id: string
  content: string
  chunk_index: number
  token_count: number
  metadata: Record<string, unknown>
  similarity: number
  doc_title: string
  doc_source_type: SourceType
  doc_source_url: string | null
  doc_file_type: string | null
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Citation {
  chunk_id: string
  document_id: string
  document_title: string
  source_type: SourceType
  source_url: string | null
  content_snippet: string
  similarity: number
  chunk_index: number
}

export interface Recommendation {
  document_id: string
  document_title: string
  source_type: SourceType
  source_url: string | null
  snippet: string
  similarity: number
}

export interface Message {
  id: string
  conversation_id: string
  user_id: string
  role: MessageRole
  content: string
  citations: Citation[]
  recommendations: Recommendation[]
  created_at: string
}

export interface IngestRequest {
  type: SourceType
  title?: string
  content?: string
  url?: string
  file?: File
}

export interface RAGContext {
  chunks: MatchedChunk[]
  query: string
  userId: string
}
