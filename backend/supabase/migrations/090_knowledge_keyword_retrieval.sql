-- 090_knowledge_keyword_retrieval.sql
-- Adds keyword retrieval alongside semantic, so kb_retrieval_mode can be
-- semantic | keyword | hybrid (per-tenant app_settings toggle).
-- tsvector('simple') = no English stemming (keeps Tamil/Hinglish tokens intact);
-- pg_trgm word_similarity adds fuzzy/inflection tolerance.

create extension if not exists pg_trgm with schema public;

alter table knowledge_chunks
    add column if not exists content_tsv tsvector
    generated always as (to_tsvector('simple', content)) stored;

create index if not exists knowledge_chunks_tsv_idx
    on knowledge_chunks using gin (content_tsv);
create index if not exists knowledge_chunks_trgm_idx
    on knowledge_chunks using gin (content gin_trgm_ops);

-- Keyword match: token match (tsvector) OR fuzzy word match (trigram), tenant-scoped.
create or replace function keyword_match_chunks(
    p_query     text,
    p_tenant_id uuid,
    match_count int default 5
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
    order by rank desc
    limit match_count;
$$;
