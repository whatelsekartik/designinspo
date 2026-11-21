import type { Database as SqliteDatabase } from "better-sqlite3";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CATEGORIES } from "@/lib/taxonomy";

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");
const DB_PATH = path.join(DATA_DIR, "infinite.db");
const SCHEMA_PATH = path.resolve(process.cwd(), "db/schema.sql");

declare global {
  // eslint-disable-next-line no-var
  var __infiniteDb: SqliteDatabase | undefined;
}

function open(): SqliteDatabase {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 8000");
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  seedTaxonomy(db);
  return db;
}

/** Keep the taxonomy table in sync with the vocabulary the agent brain uses. */
function seedTaxonomy(db: SqliteDatabase) {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO categories (id, label, description, accent, target_share, is_emerging, created_at)
     VALUES (@id, @label, @description, @accent, @targetShare, 0, @now)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, description = excluded.description,
       accent = excluded.accent, target_share = excluded.target_share`,
  );
  const tx = db.transaction(() => {
    for (const c of CATEGORIES) {
      stmt.run({ id: c.id, label: c.label, description: c.description, accent: c.accent, targetShare: c.targetShare, now });
    }
  });
  tx();
  db.prepare(
    `UPDATE categories SET image_count = (
       SELECT COUNT(*) FROM images WHERE images.category_id = categories.id AND status = 'published'
     )`,
  ).run();
}

export function getDb(): SqliteDatabase {
  if (!globalThis.__infiniteDb) {
    globalThis.__infiniteDb = open();
  }
  return globalThis.__infiniteDb;
}

/** Fresh connection — used by standalone worker scripts that run outside Next. */
export function openStandaloneDb(): SqliteDatabase {
  return open();
}

export const dbPaths = { DATA_DIR, DB_PATH };
