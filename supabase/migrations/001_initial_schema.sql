-- Enable pgvector
create extension if not exists vector;

-- Profiles: per-tenant agent configuration
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  system_prompt text default 'You are a helpful assistant. Answer questions based only on the provided context. Always cite your sources.',
  temperature float default 0.7,
  top_k int default 7,
  similarity_threshold float default 0.3,
  llm_model text default 'llama3.2:3b',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Documents: ingested content from any source
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('document', 'url', 'image', 'text')),
  source_url text,
  file_type text,
  raw_content text,
  status text not null default 'pending' check (status in ('pending', 'indexing', 'indexed', 'failed')),
  error_message text,
  chunk_count int default 0,
  token_count int default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chunks: text segments with embeddings
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding vector(384),
  chunk_index int not null,
  token_count int default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Conversations: chat sessions
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Conversation',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages: individual chat turns
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb default '[]',
  recommendations jsonb default '[]',
  created_at timestamptz default now()
);

-- Indexes for performance
create index on public.documents(user_id, status);
create index on public.documents(user_id, created_at desc);
create index on public.chunks(user_id, document_id);
create index on public.messages(conversation_id, created_at);
create index on public.conversations(user_id, updated_at desc);

-- IVFFlat index for vector similarity search (cosine)
create index on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger handle_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();
create trigger handle_updated_at before update on public.documents
  for each row execute function public.handle_updated_at();
create trigger handle_updated_at before update on public.conversations
  for each row execute function public.handle_updated_at();

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
