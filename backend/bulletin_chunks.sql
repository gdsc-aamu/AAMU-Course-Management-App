-- ============================================================
-- AAMU Course Management App — RAG Bulletin Chunks
-- Run this in Supabase SQL Editor after schema.sql
-- Requires: pgvector extension
-- ============================================================


-- ------------------------------------------------------------
-- EXTENSION
-- ------------------------------------------------------------
create extension if not exists vector;


-- ------------------------------------------------------------
-- BULLETIN CHUNKS TABLE
-- Stores pre-processed bulletin content with embeddings for
-- hybrid (full-text + semantic) retrieval.
-- ------------------------------------------------------------
create table if not exists bulletin_chunks (
  id                    uuid    primary key default gen_random_uuid(),
  chunk_id              text    unique not null,       -- stable ID from ingest pipeline
  bulletin_year         text    not null,              -- e.g. '2025-2026'
  chunk_type            text    not null,              -- requirement | policy | fee_schedule | calendar | program_info
  section_hierarchy     text,                          -- e.g. 'Academics > Financial Aid > Scholarships'
  college               text,
  department            text,
  program               text,
  title                 text,
  content               text    not null,
  page_numbers          int[],
  page_range_str        text,                          -- e.g. '35-50'
  is_critical           bool    not null default false,
  extraction_confidence float,
  token_count           int,
  content_hash          text,
  embedding             vector(1536),                  -- text-embedding-3-small
  created_at            timestamptz default now()
);


-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

-- Filter by bulletin year (used in every search)
create index if not exists idx_bulletin_chunks_year
  on bulletin_chunks (bulletin_year);

-- Filter by chunk type (hard filters for fee / calendar queries)
create index if not exists idx_bulletin_chunks_chunk_type
  on bulletin_chunks (chunk_type);

-- Composite index for the most common filter combination
create index if not exists idx_bulletin_chunks_year_type
  on bulletin_chunks (bulletin_year, chunk_type);

-- Full-text search index (used by FTS branch of hybrid search)
create index if not exists idx_bulletin_chunks_fts
  on bulletin_chunks using gin (to_tsvector('english', content));

-- Vector similarity index (IVFFlat — tune lists to ~sqrt(row count))
-- Recreate with higher lists count once ingestion is complete if needed.
create index if not exists idx_bulletin_chunks_embedding
  on bulletin_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- ------------------------------------------------------------
-- HYBRID SEARCH FUNCTION
--
-- Combines:
--   1. Full-text search  (ts_rank_cd, weighted by full_text_weight)
--   2. Semantic search   (cosine similarity, weighted by semantic_weight)
--
-- Parameters:
--   query_text        — raw user question for full-text matching
--   query_embedding   — pre-computed embedding of the question
--   match_count       — max rows to return (default 5)
--   filter_year       — restrict to a single bulletin year (e.g. '2025-2026')
--   filter_chunk_type — hard-filter by chunk type when non-null
--   boost_critical    — multiply score of is_critical rows by 1.5
--   full_text_weight  — relative weight of FTS score (default 1)
--   semantic_weight   — relative weight of semantic score (default 2)
-- ------------------------------------------------------------
create or replace function hybrid_search(
  query_text        text,
  query_embedding   vector(1536),
  match_count       int     default 5,
  filter_year       text    default null,
  filter_chunk_type text    default null,
  boost_critical    bool    default true,
  full_text_weight  float   default 1.0,
  semantic_weight   float   default 2.0
)
returns table (
  chunk_id          text,
  bulletin_year     text,
  chunk_type        text,
  section_hierarchy text,
  college           text,
  department        text,
  program           text,
  title             text,
  content           text,
  page_range_str    text,
  is_critical       bool,
  citation          text,
  combined_score    float
)
language sql stable
as $$
  with

  -- ── Full-text candidates ────────────────────────────────────
  fts as (
    select
      chunk_id,
      ts_rank_cd(
        to_tsvector('english', content),
        websearch_to_tsquery('english', query_text)
      ) as fts_score
    from bulletin_chunks
    where
      (filter_year       is null or bulletin_year = filter_year)
      and (filter_chunk_type is null or chunk_type  = filter_chunk_type)
      and to_tsvector('english', content) @@ websearch_to_tsquery('english', query_text)
  ),

  -- ── Semantic candidates (top 3× match_count before re-ranking) ──
  semantic as (
    select
      chunk_id,
      1 - (embedding <=> query_embedding) as sem_score
    from bulletin_chunks
    where
      (filter_year       is null or bulletin_year = filter_year)
      and (filter_chunk_type is null or chunk_type  = filter_chunk_type)
    order by embedding <=> query_embedding
    limit match_count * 3
  ),

  -- ── Merge and score ─────────────────────────────────────────
  merged as (
    select
      coalesce(fts.chunk_id, semantic.chunk_id) as chunk_id,
        (full_text_weight * coalesce(fts.fts_score, 0.0))
      + (semantic_weight  * coalesce(semantic.sem_score, 0.0)) as raw_score
    from fts
    full outer join semantic on fts.chunk_id = semantic.chunk_id
  )

  select
    bc.chunk_id,
    bc.bulletin_year,
    bc.chunk_type,
    bc.section_hierarchy,
    bc.college,
    bc.department,
    bc.program,
    bc.title,
    bc.content,
    bc.page_range_str,
    bc.is_critical,
    -- Construct a human-readable citation
    bc.bulletin_year || ' AAMU Bulletin'
      || case
           when bc.page_range_str is not null
           then ', pp. ' || bc.page_range_str
           else ''
         end                         as citation,
    -- Apply critical-chunk boost
    merged.raw_score
      * case
          when boost_critical and bc.is_critical then 1.5
          else 1.0
        end                          as combined_score
  from merged
  join bulletin_chunks bc on bc.chunk_id = merged.chunk_id
  order by combined_score desc
  limit match_count;
$$;
