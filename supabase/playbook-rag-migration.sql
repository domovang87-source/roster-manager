-- Optional: vector RAG for Stack draft generation (same shape as ai-domo).
-- Apply to your Stack Supabase project if you want playbook-style retrieval in /api/generate-response.
-- You must also load embeddings into knowledge_base (e.g. reuse ai-domo scripts or replicate data).

create extension if not exists vector;

create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists knowledge_base_embedding_ivfflat
  on knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function search_knowledge(
  query_embedding vector(1536),
  match_count int default 5,
  similarity_threshold float default 0.5
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where 1 - (knowledge_base.embedding <=> query_embedding) > similarity_threshold
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant select on knowledge_base to authenticated;
grant execute on function search_knowledge to authenticated;

comment on table knowledge_base is 'Optional vector store for Stack draft RAG (playbook chunks + embeddings).';
