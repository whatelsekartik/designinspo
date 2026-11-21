import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { mediaUrl } from "@/lib/agent/storage";
import type { Category, FeedImage, ImageRow } from "@/lib/types";

export type SortKey = "newest" | "trending" | "random" | "for-you";

export interface FeedQuery {
  page?: number;
  limit?: number;
  sort?: SortKey;
  category?: string;
  aesthetic?: string;
  q?: string;
  seed?: number;
  savedOnly?: boolean;
  collectionId?: string;
}

export interface FeedResult {
  images: FeedImage[];
  page: number;
  nextPage: number | null;
  hasMore: boolean;
  total: number;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toFeedImage(row: ImageRow & { category_label?: string; category_accent?: string }, saved?: { collections: { id: string; name: string }[] }): FeedImage {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    categoryId: row.category_id,
    categoryLabel: row.category_label ?? row.category_id,
    categoryAccent: row.category_accent ?? "#C96A3D",
    aesthetic: row.aesthetic,
    medium: row.medium,
    tags: safeJson<string[]>(row.tags_json, []),
    palette: safeJson<string[]>(row.palette_json, []),
    width: row.width,
    height: row.height,
    aspect: row.aspect || (row.height ? row.width / row.height : 1),
    ratioLabel: row.ratio_label,
    urls: {
      full: mediaUrl(row.storage_key),
      medium: mediaUrl(row.medium_key || row.storage_key),
      thumb: mediaUrl(row.thumb_key || row.medium_key || row.storage_key),
    },
    blurData: row.blur_data,
    avgColor: row.avg_color,
    provider: row.provider,
    model: row.model,
    source: row.source,
    saves: row.saves,
    views: row.views,
    trendingScore: row.trending_score,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    saved: (saved?.collections.length ?? 0) > 0,
    collections: saved?.collections ?? [],
  };
}

function attachCollections(rows: ImageRow[]): Map<string, { id: string; name: string }[]> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (!rows.length) return map;
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const links = db
    .prepare(
      `SELECT ci.image_id AS image_id, c.id AS id, c.name AS name
       FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
       WHERE ci.image_id IN (${placeholders}) ORDER BY c.name ASC`,
    )
    .all(...ids) as { image_id: string; id: string; name: string }[];
  for (const link of links) {
    const arr = map.get(link.image_id) ?? [];
    arr.push({ id: link.id, name: link.name });
    map.set(link.image_id, arr);
  }
  return map;
}

function sanitizeFts(q: string): string {
  const tokens = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 12);
  if (!tokens.length) return "";
  return tokens.map((t) => `${t}*`).join(" OR ");
}

const SELECT_COLS = `i.*, c.label AS category_label, c.accent AS category_accent`;

function buildWhere(query: FeedQuery, params: Record<string, unknown>): string[] {
  const where: string[] = ["i.status = 'published'"];
  if (query.category && query.category !== "all") {
    where.push("i.category_id = :category");
    params.category = query.category;
  }
  if (query.aesthetic && query.aesthetic !== "all") {
    where.push("(i.aesthetic = :aesthetic OR i.aesthetic LIKE :aestheticLike)");
    params.aesthetic = query.aesthetic;
    params.aestheticLike = `%${query.aesthetic}%`;
  }
  if (query.savedOnly || query.collectionId) {
    if (query.collectionId) {
      where.push("EXISTS (SELECT 1 FROM collection_items ci WHERE ci.image_id = i.id AND ci.collection_id = :collectionId)");
      params.collectionId = query.collectionId;
    } else {
      where.push("EXISTS (SELECT 1 FROM collection_items ci WHERE ci.image_id = i.id)");
    }
  }
  const fts = query.q ? sanitizeFts(query.q) : "";
  if (fts) {
    where.push("i.id IN (SELECT image_id FROM images_fts WHERE images_fts MATCH :fts)");
    params.fts = fts;
  }
  return where;
}

export function getFeed(query: FeedQuery = {}): FeedResult {
  const db = getDb();
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 60);
  const page = Math.max(query.page ?? 0, 0);
  const offset = Math.min(page * limit, 20000);
  const sort = query.sort ?? "newest";
  const params: Record<string, unknown> = {};

  const where = buildWhere(query, params);
  const whereSql = where.join(" AND ");

  let orderBy = "i.published_at DESC, i.id DESC";
  if (sort === "trending") orderBy = "i.trending_score DESC, i.published_at DESC";
  if (sort === "random") {
    params.rseed = query.seed ?? Math.floor(Math.random() * 1_000_000);
    orderBy = "((i.rowid * 2654435761 + :rseed) & 2147483647) ASC";
  }
  if (sort === "for-you") {
    const cats = db
      .prepare(
        `SELECT i.category_id AS cat, COUNT(*) AS n FROM collection_items ci JOIN images i ON i.id = ci.image_id
         GROUP BY i.category_id ORDER BY n DESC LIMIT 6`,
      )
      .all() as { cat: string; n: number }[];
    if (cats.length) {
      const list = cats.map((c) => `'${c.cat.replace(/'/g, "")}'`).join(",");
      orderBy = `CASE WHEN i.category_id IN (${list}) THEN 0 ELSE 1 END ASC, i.trending_score DESC, i.published_at DESC`;
    } else {
      orderBy = "i.trending_score DESC, i.published_at DESC";
    }
  }

  let rows: (ImageRow & { category_label?: string; category_accent?: string })[] = [];
  let total = 0;

  if (query.q && sanitizeFts(query.q)) {
    // Rank by relevance, blended with recency for equally relevant results.
    const rankOrder =
      sort === "newest"
        ? "bm25(images_fts, 9.0, 3.0, 1.2, 6.0, 4.0, 3.0, 2.0), i.published_at DESC"
        : `i.trending_score DESC, bm25(images_fts, 9.0, 3.0, 1.2, 6.0, 4.0, 3.0, 2.0)`;
    rows = db
      .prepare(
        `SELECT ${SELECT_COLS}
         FROM images_fts f JOIN images i ON i.id = f.image_id
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE ${whereSql.replace(/i\.id IN \(SELECT image_id FROM images_fts WHERE images_fts MATCH :fts\)/, "1=1")}
         ORDER BY ${rankOrder}
         LIMIT :limit OFFSET :offset`,
      )
      .all({ ...params, limit, offset }) as typeof rows;

    total =
      (db
        .prepare(
          `SELECT COUNT(*) AS n FROM images_fts f JOIN images i ON i.id = f.image_id
           LEFT JOIN categories c ON c.id = i.category_id WHERE ${whereSql}`,
        )
        .get(params) as { n: number })?.n ?? 0;

    if (!rows.length) {
      // Graceful fallback: substring match so typos and partial words still work.
      const like = `%${query.q.replace(/[%_]/g, "")}%`;
      rows = db
        .prepare(
          `SELECT ${SELECT_COLS} FROM images i LEFT JOIN categories c ON c.id = i.category_id
           WHERE i.status='published' AND (i.title LIKE :like OR i.description LIKE :like OR i.tags_json LIKE :like OR i.prompt LIKE :like)
           ORDER BY ${sort === "trending" ? "i.trending_score DESC" : "i.published_at DESC"} LIMIT :limit OFFSET :offset`,
        )
        .all({ like, limit, offset }) as typeof rows;
      total = rows.length ? (total || rows.length) : 0;
    }
  } else {
    rows = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM images i LEFT JOIN categories c ON c.id = i.category_id
         WHERE ${whereSql} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`,
      )
      .all({ ...params, limit, offset }) as typeof rows;
    total =
      (db
        .prepare(`SELECT COUNT(*) AS n FROM images i LEFT JOIN categories c ON c.id = i.category_id WHERE ${whereSql}`)
        .get(params) as { n: number } | undefined)?.n ?? 0;
  }

  const collections = attachCollections(rows);
  const images = rows.map((r) => toFeedImage(r, { collections: collections.get(r.id) ?? [] }));

  return {
    images,
    page,
    nextPage: rows.length === limit ? page + 1 : null,
    hasMore: rows.length === limit,
    total,
  };
}

export interface ImageDetail extends FeedImage {
  negativePrompt: string;
  seed: number | null;
  bytes: number;
  jobId: string | null;
  campaignId: string | null;
}

export function getImage(id: string): ImageDetail | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM images i LEFT JOIN categories c ON c.id = i.category_id WHERE i.id = ?`)
    .get(id) as (ImageRow & { category_label?: string; category_accent?: string }) | undefined;
  if (!row) return null;
  const collections = attachCollections([row]).get(row.id) ?? [];
  const base = toFeedImage(row, { collections });
  return {
    ...base,
    negativePrompt: row.negative_prompt,
    seed: row.seed,
    bytes: row.bytes,
    jobId: row.job_id,
    campaignId: row.campaign_id,
  };
}

export function getImagesByIds(ids: string[]): FeedImage[] {
  if (!ids.length) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM images i LEFT JOIN categories c ON c.id = i.category_id WHERE i.id IN (${placeholders})`)
    .all(...ids) as (ImageRow & { category_label?: string; category_accent?: string })[];
  const collections = attachCollections(rows);
  const byId = new Map(rows.map((r) => [r.id, toFeedImage(r, { collections: collections.get(r.id) ?? [] })]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as FeedImage[];
}

export function getRelated(id: string, limit = 12): FeedImage[] {
  const db = getDb();
  const source = db.prepare("SELECT category_id, aesthetic, tags_json FROM images WHERE id = ?").get(id) as
    | { category_id: string; aesthetic: string; tags_json: string }
    | undefined;
  if (!source) return [];
  const tags = safeJson<string[]>(source.tags_json, []).slice(0, 10);
  if (!tags.length) return [];
  const placeholders = tags.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}, COUNT(*) AS shared
       FROM image_tags t JOIN images i ON i.id = t.image_id LEFT JOIN categories c ON c.id = i.category_id
       WHERE t.tag IN (${placeholders}) AND i.id != ? AND i.status = 'published'
       GROUP BY i.id
       ORDER BY shared DESC, (i.category_id = ?) DESC, i.trending_score DESC
       LIMIT ?`,
    )
    .all(...tags, id, source.category_id, limit) as (ImageRow & { category_label?: string; category_accent?: string })[];
  const collections = attachCollections(rows);
  return rows.map((r) => toFeedImage(r, { collections: collections.get(r.id) ?? [] }));
}

export function getSimilar(id: string, limit = 18): FeedImage[] {
  const db = getDb();
  const source = db.prepare("SELECT category_id, aesthetic, palette_json, tags_json FROM images WHERE id = ?").get(id) as
    | { category_id: string; aesthetic: string; palette_json: string; tags_json: string }
    | undefined;
  if (!source) return [];
  const tags = safeJson<string[]>(source.tags_json, []).slice(0, 12);
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}, COUNT(*) AS shared
       FROM image_tags t JOIN images i ON i.id = t.image_id LEFT JOIN categories c ON c.id = i.category_id
       WHERE t.tag IN (${tags.map(() => "?").join(",") || "''"}) AND i.id != ? AND i.status='published'
       GROUP BY i.id ORDER BY shared DESC, (i.aesthetic = ?) DESC, i.trending_score DESC LIMIT ?`,
    )
    .all(...tags, id, source.aesthetic, limit * 2) as (ImageRow & { category_label?: string; category_accent?: string })[];
  const palettes = safeJson<string[]>(source.palette_json, []);
  const scored = rows.map((r) => {
    const p = safeJson<string[]>(r.palette_json, []);
    const overlap = p.filter((c) => palettes.includes(c)).length;
    return { row: r, score: overlap };
  });
  scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  const top = scored.slice(0, limit).map((s) => s.row);
  const collections = attachCollections(top);
  return top.map((r) => toFeedImage(r, { collections: collections.get(r.id) ?? [] }));
}

export function getCategories(): Category[] {
  return getDb().prepare("SELECT * FROM categories ORDER BY image_count DESC, label ASC").all() as Category[];
}

export function getCategory(id: string): Category | null {
  return (getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category) ?? null;
}

export function getAestheticCloud(limit = 24): { aesthetic: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT aesthetic, COUNT(*) AS count FROM images WHERE status='published' AND aesthetic != ''
       GROUP BY aesthetic ORDER BY count DESC LIMIT ?`,
    )
    .all(limit) as { aesthetic: string; count: number }[];
}

export function recordView(imageId: string, viewerId: string) {
  const db = getDb();
  const recent = db
    .prepare("SELECT 1 FROM image_views WHERE image_id = ? AND viewer_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(imageId, viewerId);
  if (recent) return { counted: false };
  db.prepare("INSERT INTO image_views (image_id, viewer_id, created_at) VALUES (?, ?, ?)").run(imageId, viewerId, new Date().toISOString());
  db.prepare("UPDATE images SET views = views + 1 WHERE id = ?").run(imageId);
  return { counted: true };
}

export function refreshTrending() {
  const db = getDb();
  db.exec(`
    UPDATE images
    SET trending_score = ROUND(
      (COALESCE(saves,0) * 4.0 + COALESCE(views,0) * 0.35 + 1.0) /
      POWER(MAX(1.0, (julianday('now') - julianday(published_at)) * 24.0 + 2.0), 0.62), 5)
    WHERE status = 'published'
  `);
}

export function getFeedStats() {
  const db = getDb();
  return db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
              SUM(saves) AS saves_total
       FROM images`,
    )
    .get() as { total: number; published: number; saves_total: number };
}

export function mediaFilePath(key: string): string | null {
  const root = path.resolve(process.cwd(), process.env.MEDIA_DIR || "./storage/media");
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) return null;
  return resolved;
}

export interface PublicStats {
  images: number;
  categories: number;
  today: number;
  aesthetics: number;
  saved: number;
}

export function getPublicStats(): PublicStats {
  const db = getDb();
  const images = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE status='published'").get() as { n: number }).n;
  const categories = (db.prepare("SELECT COUNT(*) AS n FROM categories WHERE image_count > 0").get() as { n: number }).n;
  const today = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE status='published' AND published_at >= date('now')").get() as { n: number }).n;
  const aesthetics = (db.prepare("SELECT COUNT(DISTINCT aesthetic) AS n FROM images WHERE status='published'").get() as { n: number }).n;
  const saved = (db.prepare("SELECT COUNT(*) AS n FROM collection_items").get() as { n: number }).n;
  return { images, categories, today, aesthetics, saved };
}
