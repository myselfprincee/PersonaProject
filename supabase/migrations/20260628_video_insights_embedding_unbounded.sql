create extension if not exists vector;

-- Convert existing fixed-dimension embedding columns to an unbounded vector
-- so Gemini embedding model upgrades or dimension changes do not break writes.
alter table public.video_insights
  alter column embedding type vector
  using embedding::vector;
