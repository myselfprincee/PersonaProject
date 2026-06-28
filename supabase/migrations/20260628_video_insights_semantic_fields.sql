create extension if not exists vector;

alter table public.video_insights
  add column if not exists topics text[] not null default '{}',
  add column if not exists keywords text[] not null default '{}';

-- Gemini Embedding 2 currently returns 3072 dimensions in this app.
alter table public.video_insights
  add column if not exists embedding vector(3072) null;
