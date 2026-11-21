# Hosted deployment — Supabase

INFINITE runs out of the box on an embedded SQLite database with local object storage. This directory contains everything needed to move the hosted pieces to Supabase.

## What is ready

| Piece | File | Status |
| --- | --- | --- |
| Postgres schema | `migrations/0001_init.sql` | Validated on Postgres 17 (11 tables, indexes, RLS, FTS, helper functions) |
| Public media bucket | inside the migration (`infinite-media`) | Created by the migration |
| Object-storage driver | `src/lib/agent/storage.ts` (`STORAGE_DRIVER=supabase`) | Implemented; uploads are idempotent and use immutable cache headers |
| Data-access driver | `src/lib/repo/*` | SQLite adapter only — the Postgres adapter is the remaining work for a fully hosted data layer |

The Postgres migration was executed against a local Postgres 17 instance during development, with the full-text search column, `infinite_feed()` and `infinite_refresh_trending()` verified against inserted rows.

## Apply the schema

1. **Create a project** in the Supabase dashboard (or with the CLI: `supabase projects create`).
2. **Run the migration.** Open *SQL Editor* and paste `migrations/0001_init.sql`, or use the CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push        # if you keep this directory as your migrations folder
   ```

3. **Confirm the bucket** `infinite-media` exists and is public (*Storage → infinite-media*). The migration inserts it and adds a public-read policy.
4. **Collect credentials** from *Project Settings → API*:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY` — server only, used by the worker for uploads and writes.
5. Set them in your host's environment:

   ```bash
   STORAGE_DRIVER=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_MEDIA_BUCKET=infinite-media
   SUPABASE_SERVICE_ROLE_KEY=…
   ```

   Keep `AGENT_AUTOSTART=true` on a single worker node, or run `npm run agent` separately.

## Schema overview

* `images` — the generated library: prompt, negative prompt, category, aesthetic, medium, palette (jsonb), tags (jsonb), dimensions, storage keys, perceptual hash, pixel statistics, provider/model/cost, engagement counters and a **generated `tsvector` column** (`title` A, `description`/`aesthetic` B, `medium`/`tags` C, `prompt` D) with a GIN index.
* `image_tags`, `categories` — facets and coverage targets.
* `generation_jobs` — the queue: status, attempts, priority, campaign, cost, timing, error.
* `concept_memory` — everything the agent has already imagined (novelty scoring).
* `agent_events`, `campaigns` — activity log and creative-direction campaigns.
* `collections`, `collection_items` — saved images.
* `image_views`, `settings` — analytics and runtime controls.
* `infinite_feed(limit, offset, sort, category, aesthetic, query)` — paginated feed with relevance ordering.
* `infinite_refresh_trending()` — decayed engagement score, ready to schedule with `pg_cron`.

## Security model

* Row-level security is enabled on every table.
* Published content, categories, campaigns and activity are publicly readable; writes require the service role (the worker), which bypasses RLS.
* Collections are open (`using (true)`) to support the single-player demo with the anon key. For multi-user deployments, replace those policies with `auth.uid()` ownership checks.
* The service-role key must never be exposed to the browser — only `NEXT_PUBLIC_*` values may be shipped to the client.

## Moving the data layer

The repo's query layer (`src/lib/repo/images.ts`, `collections.ts`, `settings.ts`, `src/lib/agent/pipeline.ts`) is plain SQL against `better-sqlite3`. A Postgres adapter needs:

1. A connection client (Supabase REST or a pooled Postgres connection) with the same function signatures as `getDb().prepare(...)`.
2. Replacements for SQLite specifics: `jsonb` columns already match, `FTS5` → `search_vector @@ websearch_to_tsquery`, `rowid` random sort → `md5(id)`, `julianday()` → `extract(epoch from …)` (already expressed in `infinite_refresh_trending()`).
3. Moving `storage_key` URLs to the bucket's public URLs (`/storage/v1/object/public/infinite-media/<key>`) — the storage driver already returns those.

The SQLite store remains the recommended default for a single-server deployment: it needs no connection pool, keeps the feed queries under a millisecond for tens of thousands of rows, and lets the worker and web server share one file with WAL.
