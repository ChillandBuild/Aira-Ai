-- 091_knowledge_campaign_scope.sql
-- Campaign-scoped knowledge retrieval. A KB document may be tagged to a campaign
-- (broadcast_tags.id); chunks inherit that tag. At reply time the lead's resolved
-- campaign filters retrieval to (its campaign + global docs).
--
-- SUPERSET SAFETY: when the caller passes p_campaign_tag_id = NULL (cold lead, or a
-- tenant not using campaigns), the filter is a no-op and ALL chunks return — i.e.
-- identical to pre-091 behaviour. campaign_tag_id IS NULL on a chunk = "global".

alter table knowledge_documents
    add column if not exists campaign_tag_id uuid references broadcast_tags(id) on delete set null;

alter table knowledge_chunks
    add column if not exists campaign_tag_id uuid;

create index if not exists knowledge_chunks_campaign_idx
    on knowledge_chunks (campaign_tag_id) where campaign_tag_id is not null;

-- insert_knowledge_chunk: carry the document's campaign tag onto the chunk.
drop function if exists insert_knowledge_chunk(uuid, uuid, int, text, text);
create or replace function insert_knowledge_chunk(
    p_tenant_id       uuid,
    p_document_id     uuid,
    p_chunk_index     int,
    p_content         text,
    p_embedding       text,
    p_campaign_tag_id uuid default null
) returns void
language plpgsql
as $$
begin
    insert into knowledge_chunks (tenant_id, document_id, chunk_index, content, embedding, campaign_tag_id)
    values (p_tenant_id, p_document_id, p_chunk_index, p_content, p_embedding::vector(512), p_campaign_tag_id);
end;
$$;

-- match_knowledge_chunks: campaign-aware cosine match.
-- p_campaign_tag_id NULL → no filter (all chunks). Set → campaign chunks + global chunks.
drop function if exists match_knowledge_chunks(text, uuid, int);
create or replace function match_knowledge_chunks(
    query_embedding   text,
    p_tenant_id       uuid,
    match_count       int default 5,
    p_campaign_tag_id uuid default null
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
      and (
        p_campaign_tag_id is null
        or kc.campaign_tag_id = p_campaign_tag_id
        or kc.campaign_tag_id is null
      )
    order by kc.embedding <=> query_embedding::vector(512)
    limit match_count;
$$;

-- keyword_match_chunks: campaign-aware token/trigram match (same superset semantics).
drop function if exists keyword_match_chunks(text, uuid, int);
create or replace function keyword_match_chunks(
    p_query           text,
    p_tenant_id       uuid,
    match_count       int default 5,
    p_campaign_tag_id uuid default null
) returns table (
    document_id uuid,
    content     text,
    rank        float
)
language sql
stable
as $$
    select
        kc.document_id,
        kc.content,
        greatest(
            ts_rank(kc.content_tsv, websearch_to_tsquery('simple', p_query)),
            word_similarity(p_query, kc.content)
        )::float as rank
    from knowledge_chunks kc
    where kc.tenant_id = p_tenant_id
      and (
        kc.content_tsv @@ websearch_to_tsquery('simple', p_query)
        or p_query <% kc.content
      )
      and (
        p_campaign_tag_id is null
        or kc.campaign_tag_id = p_campaign_tag_id
        or kc.campaign_tag_id is null
      )
    order by rank desc
    limit match_count;
$$;
