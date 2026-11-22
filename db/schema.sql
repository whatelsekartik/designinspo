-- ═══════════════════════════════════════════════════════════════════
-- INFINITE — canonical schema (SQLite runtime)
-- A faithful Postgres/Supabase translation lives in supabase/migrations
-- ═══════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 8000;

-- ── Taxonomy ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  accent        TEXT NOT NULL DEFAULT '#C96A3D',
  target_share  REAL NOT NULL DEFAULT 0.03,
  is_emerging   INTEGER NOT NULL DEFAULT 0,
  parent_id     TEXT,
  image_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_count ON categories(image_count DESC);

-- ── Generated images ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS images (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  prompt         TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  category_id    TEXT NOT NULL,
  aesthetic      TEXT NOT NULL DEFAULT '',
  medium         TEXT NOT NULL DEFAULT '',
  seed           INTEGER,
  palette_json   TEXT NOT NULL DEFAULT '[]',
  tags_json      TEXT NOT NULL DEFAULT '[]',
  width          INTEGER NOT NULL DEFAULT 0,
  height         INTEGER NOT NULL DEFAULT 0,
  aspect         REAL NOT NULL DEFAULT 1,
  ratio_label    TEXT NOT NULL DEFAULT '1:1',
  storage_key    TEXT NOT NULL DEFAULT '',
  medium_key     TEXT NOT NULL DEFAULT '',
  thumb_key      TEXT NOT NULL DEFAULT '',
  original_url   TEXT NOT NULL DEFAULT '',
  blur_data      TEXT NOT NULL DEFAULT '',
  bytes          INTEGER NOT NULL DEFAULT 0,
  phash          TEXT NOT NULL DEFAULT '',
  avg_color      TEXT NOT NULL DEFAULT '#1a1512',
  brightness     REAL NOT NULL DEFAULT 0,
  saturation     REAL NOT NULL DEFAULT 0,
  provider       TEXT NOT NULL DEFAULT '',
  model          TEXT NOT NULL DEFAULT '',
  cost_cents     REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'published',
  source         TEXT NOT NULL DEFAULT 'agent',
  job_id         TEXT,
  campaign_id    TEXT,
  batch_id       TEXT,
  views          INTEGER NOT NULL DEFAULT 0,
  saves          INTEGER NOT NULL DEFAULT 0,
  trending_score REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  published_at   TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_images_published   ON images(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_category    ON images(category_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_trending    ON images(status, trending_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_job         ON images(job_id);
CREATE INDEX IF NOT EXISTS idx_images_campaign    ON images(campaign_id);
CREATE INDEX IF NOT EXISTS idx_images_phash       ON images(phash);
CREATE INDEX IF NOT EXISTS idx_images_aesthetic   ON images(aesthetic);
CREATE INDEX IF NOT EXISTS idx_images_created     ON images(created_at DESC);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id TEXT NOT NULL,
  tag      TEXT NOT NULL,
  PRIMARY KEY (image_id, tag),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag);

-- Full-text search over the whole metadata surface
CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
  image_id UNINDEXED,
  title,
  description,
  prompt,
  tags,
  category,
  aesthetic,
  medium,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ── Generation pipeline ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_jobs (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued | running | succeeded | failed | cancelled
  priority     INTEGER NOT NULL DEFAULT 50,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  category_id  TEXT,
  brief        TEXT NOT NULL DEFAULT '',
  idea_json    TEXT NOT NULL DEFAULT '{}',
  prompt       TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  aspect       REAL NOT NULL DEFAULT 1,
  provider     TEXT NOT NULL DEFAULT '',
  model        TEXT NOT NULL DEFAULT '',
  campaign_id  TEXT,
  batch_id     TEXT,
  image_id     TEXT,
  error        TEXT,
  cost_cents   REAL NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON generation_jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON generation_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created  ON generation_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS concept_memory (
  id          TEXT PRIMARY KEY,
  image_id    TEXT,
  category_id TEXT NOT NULL,
  aesthetic   TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL DEFAULT '',
  concept_key TEXT NOT NULL DEFAULT '',
  tokens_json TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_concept_key      ON concept_memory(concept_key);
CREATE INDEX IF NOT EXISTS idx_concept_category ON concept_memory(category_id);

CREATE TABLE IF NOT EXISTS agent_events (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,          -- idea | queue | generate | publish | error | control | campaign | classify
  level      TEXT NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  meta_json  TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind    ON agent_events(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  direction       TEXT NOT NULL,
  categories_json TEXT NOT NULL DEFAULT '[]',
  target_count    INTEGER NOT NULL DEFAULT 40,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL,
  finished_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);

-- ── Collections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL DEFAULT 'local',
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  accent      TEXT NOT NULL DEFAULT '#C96A3D',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  image_id      TEXT NOT NULL,
  added_at      TEXT NOT NULL,
  PRIMARY KEY (collection_id, image_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_items_image ON collection_items(image_id, added_at DESC);

CREATE TABLE IF NOT EXISTS image_views (
  image_id   TEXT NOT NULL,
  viewer_id  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_views_image ON image_views(image_id);

-- ── Runtime settings (agent controls) ──────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
