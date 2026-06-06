-- 087_knowledge_rag.sql
-- pgvector RAG for the knowledge base. Replaces full-text injection with
-- chunked, embedded retrieval. Embeddings: Voyage voyage-3-lite (512-dim).
-- vector 0.8.0 is already installed on this project.

create extension if not exists vector with schema public;

create table if not exists knowledge_chunks (
    id           uuid primary key default gen_random_uuid(),
    tenant_id    uuid not null,
    document_id  uuid not null references knowledge_documents(id) on delete cascade,
    chunk_index  int  not null,
    content      text not null,
    embedding    vector(512),
    created_at   timestamptz not null default now()
);

create index if not exists knowledge_chunks_tenant_idx on knowledge_chunks (tenant_id);
create index if not exists knowledge_chunks_doc_idx    on knowledge_chunks (document_id);
create index if not exists knowledge_chunks_embedding_idx
    on knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- Insert a chunk. Embedding arrives as a vector-literal string (e.g. '[0.1,0.2,...]')
-- and is cast inside, sidestepping PostgREST/supabase-py vector serialization.
create or replace function insert_knowledge_chunk(
    p_tenant_id   uuid,
    p_document_id uuid,
    p_chunk_index int,
    p_content     text,
    p_embedding   text
) returns void
language plpgsql
as $$
begin
    insert into knowledge_chunks (tenant_id, document_id, chunk_index, content, embedding)
    values (p_tenant_id, p_document_id, p_chunk_index, p_content, p_embedding::vector(512));
end;
$$;

-- Top-k cosine match, tenant-scoped. query_embedding is a vector-literal string.
create or replace function match_knowledge_chunks(
    query_embedding text,
    p_tenant_id     uuid,
    match_count     int default 5
) returns table (
    document_id uuid,
    content     text,
    similarity  float
)
language sql
stable
as $$
    select
        kc.document_id,
        kc.content,
        1 - (kc.embedding <=> query_embedding::vector(512)) as similarity
    from knowledge_chunks kc
    where kc.tenant_id = p_tenant_id
      and kc.embedding is not null
    order by kc.embedding <=> query_embedding::vector(512)
    limit match_count;
$$;
