# INFINITE

**An AI-powered visual inspiration universe.** A Pinterest-grade discovery experience for a library that is *generated, catalogued and published by an autonomous agent* — architecture, interiors, graphic design, UI, typography, branding, posters, fashion, product, landscapes, and whatever direction the agent discovers next.

Every image in the feed comes from the generation pipeline. No stock photos, no scraped boards, no placeholder tiles.

```
IDEA → PROMPT → GENERATE → QUALITY CHECK → DEDUPE → CLASSIFY → STORAGE → PUBLISH → NEXT IDEA
```

---

## What's inside

| Layer | Implementation |
| --- | --- |
| **Discover feed** | Editorial masonry, infinite scroll, category + aesthetic filters, newest / trending / for-you / shuffle, quick-save, cinematic hover states, full-canvas viewer |
| **Image viewer** | Large preview, description, prompt, palette, dimensions, model, related + visually similar sets, download, copy prompt, "generate variations", "explore this aesthetic" |
| **Search** | SQLite FTS5 with BM25 ranking and per-column weights, prefix matching, graceful LIKE fallback, aesthetic facets, trending searches, ⌘K overlay |
| **Collections** | Create / rename / delete collections, save to one or many, remove, collection feeds with the same quality as discovery |
| **AI Studio** | Live queue, real counts, spend vs budget, generation-rate sparkline, category coverage map with target shares, priority toggles, activity log, pause/resume, batch triggers, batch size / frequency / concurrency / novelty / budget controls, creative-direction campaigns |
| **Agent** | Coverage-weighted idea sampler, prompt composer, novelty scoring against concept memory, provider adapters, retries with re-imagining, perceptual-hash dedupe, pixel-derived palettes, emerging-category discovery, full activity log |
| **Storage** | Webp variants (512 / 960 / 1600) + 24px blur placeholders, immutable cache headers, local object store by default, Supabase Storage driver included |
| **Data** | Embedded SQLite (WAL, FTS5, indexes on category/tags/trending/perceptual hash) with a validated Postgres/Supabase schema in `supabase/migrations` |

---

## Quick start

```bash
npm install
cp .env.example .env.local     # add one image-provider key
npm run dev                    # http://localhost:3000
```

The server boots the agent runtime automatically (`AGENT_AUTOSTART=true`). With no provider configured the app is fully functional — the feed shows the seeded library, the studio reports honestly that it is *awaiting credentials*, and nothing is ever simulated.

A pre-seeded library ships in `storage/media` + `.seed/` so the feed is never empty on first boot:

```bash
npm run seed     # (re)ingest the curated manifest through the real pipeline
```

---

## 1 · Configure an image provider

Copy `.env.example` → `.env.local` and fill in **one** block:

```bash
# OpenAI
IMAGE_PROVIDER=openai
OPENAI_API_KEY=sk-…

# Google Gemini
IMAGE_PROVIDER=gemini
GEMINI_API_KEY=…

# fal.ai (FLUX)
IMAGE_PROVIDER=fal
FAL_KEY=…

# Replicate
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_…

# Stability AI
IMAGE_PROVIDER=stability
STABILITY_API_KEY=sk-…
```

Optional tuning: `IMAGE_MODEL`, `IMAGE_QUALITY` (low/medium/high for OpenAI), `IMAGE_COST_CENTS` (per-image cost used by the budget guard), `IMAGE_TIMEOUT_MS`, `DUP_PHASH_DISTANCE`, `INITIAL_BATCH_SIZE`.

The first time a provider is present, the runtime queues an initial population batch (`INITIAL_BATCH_SIZE`, default 40) and starts working through it.

**Missing credentials are a first-class state**: the studio, `/setup`, `/api/health` and the CLI all report exactly which variable is missing. No fake progress, no placeholder images, no invented statistics.

---

## 2 · Run the worker

The generation loop is server-side and independent of any browser session.

```bash
# A. in-process (default, single node)
npm run dev        # or: npm run build && npm start

# B. dedicated worker process
AGENT_AUTOSTART=false npm start      # web server, no loop
npm run agent                        # continuous loop
npm run agent:once 8                 # drain 8 jobs, then exit

# C. external scheduler
curl -X POST https://your-host/api/agent/tick \
  -H "Authorization: Bearer $AGENT_TICK_TOKEN"
```

All three share the same queue, database, budget and storage. Job claiming is an atomic conditional update, so two workers can never execute the same job.

---

## 3 · The agent

**Idea generation is separate from image generation.** The brain (`src/lib/agent/brain.ts`) composes concepts from a 32-category taxonomy — each with its own vocabulary of media, subjects, aesthetics, materials, lighting, composition, palettes, moods and details — and scores each candidate:

* **Coverage weighting** — categories below their target share are sampled far more often.
* **Novelty scoring** — token-set Jaccard distance against the last ~220 concepts, plus concept fingerprints. The sampler retries up to 28 times to beat the configured novelty threshold.
* **Emerging categories** — as the library grows, the agent introduces directions it has not used before (e.g. *Liquid Interfaces*, *Archival Futurism*, *Deep Sea Design*) and starts feeding them into rotation.
* **Creative direction** — any free-form brief becomes a campaign; the agent folds its keywords into the aesthetic and subject pools and enqueues a target number of jobs through the same queue.

The runtime (`src/lib/agent/runtime.ts`) refills the queue on a configurable frequency, runs N jobs concurrently, enforces the budget, retries failures with a freshly imagined concept, releases stuck jobs, refreshes trending scores and records every step as an agent event.

### Publication pipeline (`src/lib/agent/pipeline.ts`)

1. QA: decode metadata, require ≥ 320×320 px.
2. Dedupe: 64-bit dHash, reject anything within a Hamming distance of 6 of the 600 newest images.
3. Variants: 1600/960/512 webp + blur placeholder, written to object storage under `<image-id>/`.
4. Classification: category from the idea, tags from subject/material/palette/mood, palette extracted from the actual pixels (k-means), brightness + saturation, average colour.
5. Persistence: image row, tags, FTS index, concept memory, coverage counter, campaign counter, activity event.
6. Publication: appears at the top of the discovery feed immediately.

---

## 4 · No API budget? Use the manifest workflow

The agent can still do the hard part — the thinking.

```bash
npm run concepts         # curated seed concepts → .seed/manifest.json
# or from the studio: POST /api/studio/manifest  (returns composed prompts)

# generate those prompts with any external tool, drop files in a folder, then:
npm run ingest -- --manifest .seed/manifest.json --dir .seed/raw
```

Ingested files pass through the exact same pipeline (QA, dedupe, variants, classification, storage, publication), so the library stays coherent and searchable. This is how the shipped initial library was produced.

---

## 5 · Architecture

```
┌──────────────────────────── Next.js 16 (App Router) ────────────────────────────┐
│  /            discovery feed (SSR seed + client pagination)                      │
│  /image/[id]  shareable detail page                                              │
│  /search      FTS + aesthetic facets                                             │
│  /collections CRUD + saved feeds                                                 │
│  /studio      live agent control room                                            │
│  /setup       provider + deployment guide                                        │
│                                                                                  │
│  /api/feed · /api/images/[id] · /api/collections · /api/save · /api/stats        │
│  /api/studio/{status,control,settings,campaign,manifest,events}                  │
│  /api/agent/tick (token-guarded) · /api/health · /media/[...]                    │
└──────────────────────────────────┬───────────────────────────────────────────────┘
                                   │  same process (or a second worker)
┌──────────────────────────────────▼───────────────────────────────────────────────┐
│  Agent runtime ──► queue ──► worker(pool) ──► provider adapter (5 options)        │
│       │                │            │                                            │
│       │                │            ├─► QA + dHash dedupe                        │
│       │                │            ├─► variants + palette + classification      │
│       │                │            └─► object storage (local | supabase)         │
│       ▼                ▼                                                          │
│  SQLite (WAL + FTS5) · images · tags · jobs · concepts · events · collections      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Scaling notes.** Feed queries are offset-paginated and indexed; images are never loaded at full size in the grid (512/960/1600 srcset, lazy, blur placeholders); list payloads are capped at 60; media is served with immutable cache headers; the queue is a controlled pool with concurrency, frequency and budget guards — never thousands of simultaneous requests. Trending is recomputed periodically rather than per request.

---

## 6 · Hosted deployment (Supabase)

The runtime database is the embedded SQLite store — zero configuration, fast, and the only data adapter shipped today. A validated Postgres schema for Supabase lives in `supabase/migrations/0001_init.sql` (11 tables, generated `tsvector` search column with GIN index, trigram title index, RLS policies for public read, an `infinite-media` bucket, `infinite_feed()` and `infinite_refresh_trending()` helpers). It was executed against Postgres 17 during development and verified end-to-end (FTS match, feed function, trending function).

Object storage *can* move to Supabase today:

```bash
STORAGE_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_MEDIA_BUCKET=infinite-media
SUPABASE_SERVICE_ROLE_KEY=…        # server only — never exposed to the client
```

See [`supabase/README.md`](supabase/README.md) for the exact steps and the migration path for the data adapter.

---

## 7 · Project layout

```
db/schema.sql                  SQLite schema (canonical runtime)
src/app/                       routes, API handlers, design system
src/components/                feed, viewer, studio, collections, search
src/lib/agent/                 brain, providers, imaging, storage, pipeline, runtime
src/lib/repo/                  feed/search/collections/settings queries
supabase/migrations/           Postgres schema for hosted deployments
scripts/                       migrate · seed-concepts · ingest · agent worker
storage/media/                 generated assets (webp variants)
.seed/                         curated manifest + source images
```

---

## 8 · Honest status

* The shipped library is real AI-generated imagery produced through the ingestion pipeline (`provider: arena-studio`), with the full prompt and metadata for each image. It is a seed, not "thousands" yet — the loop, queue and budget controls are what make the library grow. Point the agent at a provider and it will keep publishing.
* `views` and `saves` are only incremented by real interactions; nothing is seeded with fake engagement.
* No generation provider credentials are included. Without them the studio says so.
