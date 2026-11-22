-- ═══════════════════════════════════════════════════════════════════
-- INFINITE — hosted Postgres schema (Supabase)
-- Mirrors db/schema.sql, with tsvector full-text search, GIN indexes,
-- row-level security and a public media bucket.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ── Taxonomy ───────────────────────────────────────────────────────
create table if not exists public.categories (
  id            text primary key,
  label         text not null,
  description   text not null default '',
  accent        text not null default '#C96A3D',
  target_share  numeric not null default 0.03,
  is_emerging   boolean not null default false,
  parent_id     text,
  image_count   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_categories_count on public.categories (image_count desc);

-- ── Generated images ───────────────────────────────────────────────
create table if not exists public.images (
  id              text primary key,
  title           text not null,
  description     text not null default '',
  prompt          text not null default '',
  negative_prompt text not null default '',
  category_id     text not null references public.categories(id),
  aesthetic       text not null default '',
  medium          text not null default '',
  seed            bigint,
  palette         jsonb not null default '[]'::jsonb,
  tags            jsonb not null default '[]'::jsonb,
  width           integer not null default 0,
  height          integer not null default 0,
  aspect          numeric not null default 1,
  ratio_label     text not null default '1:1',
  storage_key     text not null default '',
  medium_key      text not null default '',
  thumb_key       text not null default '',
  original_url    text not null default '',
  blur_data       text not null default '',
  bytes           bigint not null default 0,
  phash           text not null default '',
  avg_color       text not null default '#1a1512',
  brightness      real not null default 0,
  saturation      real not null default 0,
  provider        text not null default '',
  model           text not null default '',
  cost_cents      numeric not null default 0,
  status          text not null default 'published',
  source          text not null default 'agent',
  job_id          text,
  campaign_id     text,
  batch_id        text,
  views           integer not null default 0,
  saves           integer not null default 0,
  trending_score  real not null default 0,
  search_vector   tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(aesthetic, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(medium, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(tags::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(prompt, '')), 'D')
  ) stored,
  created_at      timestamptz not null default now(),
  published_at    timestamptz not null default now()
);
create index if not exists idx_images_published  on public.images (status, published_at desc);
create index if not exists idx_images_category   on public.images (category_id, published_at desc);
create index if not exists idx_images_trending   on public.images (status, trending_score desc, published_at desc);
create index if not exists idx_images_phash      on public.images (phash);
create index if not exists idx_images_aesthetic  on public.images (aesthetic);
create index if not exists idx_images_job        on public.images (job_id);
create index if not exists idx_images_campaign   on public.images (campaign_id);
create index if not exists idx_images_search     on public.images using gin (search_vector);
create index if not exists idx_images_title_trgm on public.images using gin (title gin_trgm_ops);
create index if not exists idx_images_tags_gin   on public.images using gin (tags jsonb_path_ops);

create table if not exists public.image_tags (
  image_id text not null references public.images(id) on delete cascade,
  tag      text not null,
  primary key (image_id, tag)
);
create index if not exists idx_image_tags_tag on public.image_tags (tag);

-- ── Generation pipeline ────────────────────────────────────────────
create table if not exists public.generation_jobs (
  id              text primary key,
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  priority        integer not null default 50,
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  category_id     text,
  brief           text not null default '',
  idea            jsonb not null default '{}'::jsonb,
  prompt          text not null default '',
  negative_prompt text not null default '',
  aspect          numeric not null default 1,
  provider        text not null default '',
  model           text not null default '',
  campaign_id     text,
  batch_id        text,
  image_id        text,
  error           text,
  cost_cents      numeric not null default 0,
  duration_ms     integer not null default 0,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
create index if not exists idx_jobs_status   on public.generation_jobs (status, priority desc, created_at);
create index if not exists idx_jobs_campaign on public.generation_jobs (campaign_id);
create index if not exists idx_jobs_created  on public.generation_jobs (created_at desc);

create table if not exists public.concept_memory (
  id          text primary key default gen_random_uuid()::text,
  image_id    text references public.images(id) on delete set null,
  category_id text not null,
  aesthetic   text not null default '',
  subject     text not null default '',
  concept_key text not null default '',
  tokens      jsonb not null default '[]'::jsonb,
  fingerprint text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_concept_key      on public.concept_memory (concept_key);
create index if not exists idx_concept_category on public.concept_memory (category_id);

create table if not exists public.agent_events (
  id         text primary key default gen_random_uuid()::text,
  kind       text not null,
  level      text not null default 'info',
  message    text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_created on public.agent_events (created_at desc);
create index if not exists idx_events_kind    on public.agent_events (kind, created_at desc);

create table if not exists public.campaigns (
  id              text primary key default gen_random_uuid()::text,
  title           text not null,
  direction       text not null,
  categories      jsonb not null default '[]'::jsonb,
  target_count    integer not null default 40,
  completed_count integer not null default 0,
  failed_count    integer not null default 0,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists idx_campaigns_created on public.campaigns (created_at desc);

-- ── Collections ────────────────────────────────────────────────────
create table if not exists public.collections (
  id          text primary key default ('cl_' || substr(gen_random_uuid()::text, 1, 10)),
  owner_id    text not null default 'local',
  name        text not null,
  description text not null default '',
  accent      text not null default '#C96A3D',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.collection_items (
  collection_id text not null references public.collections(id) on delete cascade,
  image_id      text not null references public.images(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, image_id)
);
create index if not exists idx_collection_items_image on public.collection_items (image_id, added_at desc);

create table if not exists public.image_views (
  image_id   text not null references public.images(id) on delete cascade,
  viewer_id  text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_views_image on public.image_views (image_id, viewer_id);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── Row level security ─────────────────────────────────────────────
-- Public read for published content, write access only for the worker
-- (service role bypasses RLS). Collections are open so the single-player
-- demo works with the anon key; tighten with auth.uid() for multi-user.
alter table public.categories       enable row level security;
alter table public.images           enable row level security;
alter table public.image_tags       enable row level security;
alter table public.collections      enable row level security;
alter table public.collection_items enable row level security;
alter table public.campaigns        enable row level security;
alter table public.generation_jobs  enable row level security;
alter table public.agent_events     enable row level security;
alter table public.concept_memory   enable row level security;
alter table public.image_views      enable row level security;
alter table public.settings         enable row level security;

drop policy if exists "read categories" on public.categories;
create policy "read categories" on public.categories for select using (true);

drop policy if exists "read published images" on public.images;
create policy "read published images" on public.images for select using (status = 'published');

drop policy if exists "read image tags" on public.image_tags;
create policy "read image tags" on public.image_tags for select using (true);

drop policy if exists "read collections" on public.collections;
create policy "read collections" on public.collections for select using (true);
drop policy if exists "write collections" on public.collections;
create policy "write collections" on public.collections for all using (true) with check (true);

drop policy if exists "read collection items" on public.collection_items;
create policy "read collection items" on public.collection_items for select using (true);
drop policy if exists "write collection items" on public.collection_items;
create policy "write collection items" on public.collection_items for all using (true) with check (true);

drop policy if exists "read campaigns" on public.campaigns;
create policy "read campaigns" on public.campaigns for select using (true);

drop policy if exists "read events" on public.agent_events;
create policy "read events" on public.agent_events for select using (true);

drop policy if exists "insert views" on public.image_views;
create policy "insert views" on public.image_views for insert with check (true);

-- ── Storage bucket for generated media ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('infinite-media', 'infinite-media', true, 10485760, array['image/webp','image/jpeg','image/png','image/avif'])
on conflict (id) do update set public = true;

drop policy if exists "public read infinite media" on storage.objects;
create policy "public read infinite media" on storage.objects
  for select using (bucket_id = 'infinite-media');

-- ── Helpers ────────────────────────────────────────────────────────
create or replace function public.infinite_feed(
  p_limit integer default 24,
  p_offset integer default 0,
  p_sort text default 'newest',
  p_category text default null,
  p_aesthetic text default null,
  p_query text default null
)
returns setof public.images
language sql stable as $$
  select *
  from public.images i
  where i.status = 'published'
    and (p_category is null or i.category_id = p_category)
    and (p_aesthetic is null or i.aesthetic = p_aesthetic)
    and (p_query is null or i.search_vector @@ websearch_to_tsquery('english', p_query))
  order by
    case when p_sort = 'trending' then i.trending_score end desc nulls last,
    case when p_sort = 'random' then md5(i.id) end asc nulls last,
    i.published_at desc
  limit greatest(1, least(p_limit, 60))
  offset greatest(0, p_offset);
$$;

create or replace function public.infinite_refresh_trending()
returns void language sql as $$
  update public.images
  set trending_score = round((
    (coalesce(saves, 0) * 4.0 + coalesce(views, 0) * 0.35 + 1.0) /
    power(greatest(1.0, extract(epoch from (now() - published_at)) / 3600.0 + 2.0), 0.62)
  )::numeric, 5)::real
  where status = 'published';
$$;
