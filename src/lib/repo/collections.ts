import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import type { Collection } from "@/lib/types";

const ACCENTS = ["#C96A3D", "#C9A06A", "#8FA5B8", "#93A57C", "#B2798F", "#D9A45B"];

export function listCollections(): Collection[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, COUNT(ci.image_id) AS item_count
       FROM collections c LEFT JOIN collection_items ci ON ci.collection_id = c.id
       GROUP BY c.id ORDER BY c.updated_at DESC`,
    )
    .all() as Collection[];
  const previews = db
    .prepare(
      `SELECT ci.collection_id AS cid, i.thumb_key AS thumb FROM collection_items ci
       JOIN images i ON i.id = ci.image_id ORDER BY ci.added_at DESC`,
    )
    .all() as { cid: string; thumb: string }[];
  const byColl = new Map<string, string[]>();
  for (const p of previews) {
    const arr = byColl.get(p.cid) ?? [];
    if (arr.length < 4) arr.push(p.thumb);
    byColl.set(p.cid, arr);
  }
  return rows.map((r) => ({ ...r, preview: byColl.get(r.id) ?? [] }));
}

export function getCollection(id: string): Collection | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*, COUNT(ci.image_id) AS item_count FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id WHERE c.id = ? GROUP BY c.id`,
    )
    .get(id) as Collection | undefined;
  return row ?? null;
}

export function createCollection(name: string, description = "", accent?: string): Collection {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `cl_${nanoid(10)}`;
  db.prepare(
    "INSERT INTO collections (id, owner_id, name, description, accent, created_at, updated_at) VALUES (?, 'local', ?, ?, ?, ?, ?)",
  ).run(id, name.trim(), description, accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)], now, now);
  return getCollection(id)!;
}

export function updateCollection(id: string, patch: { name?: string; description?: string; accent?: string }): Collection | null {
  const db = getDb();
  const existing = getCollection(id);
  if (!existing) return null;
  db.prepare("UPDATE collections SET name = ?, description = ?, accent = ?, updated_at = ? WHERE id = ?").run(
    patch.name?.trim() || existing.name,
    patch.description ?? existing.description,
    patch.accent ?? existing.accent,
    new Date().toISOString(),
    id,
  );
  return getCollection(id);
}

export function deleteCollection(id: string) {
  const db = getDb();
  const images = db.prepare("SELECT image_id FROM collection_items WHERE collection_id = ?").all(id) as { image_id: string }[];
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
  const dec = db.prepare("UPDATE images SET saves = MAX(0, saves - 1) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM collection_items WHERE image_id = ?)");
  for (const img of images) dec.run(img.image_id, img.image_id);
  return true;
}

export function ensureDefaultCollection(): Collection {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM collections ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
  if (existing) return getCollection(existing.id)!;
  const created = createCollection("Saved", "Everything you loved at first sight.", ACCENTS[0]);
  return created;
}

export function addToCollection(collectionId: string, imageId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db
    .prepare("INSERT OR IGNORE INTO collection_items (collection_id, image_id, added_at) VALUES (?, ?, ?)")
    .run(collectionId, imageId, now);
  if (res.changes > 0) {
    db.prepare("UPDATE images SET saves = saves + 1, trending_score = trending_score + 1 WHERE id = ?").run(imageId);
  }
  db.prepare("UPDATE collections SET updated_at = ? WHERE id = ?").run(now, collectionId);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM collection_items WHERE image_id = ?").get(imageId) as { n: number }).n;
  return { saved: count > 0, added: res.changes > 0 };
}

export function removeFromCollection(collectionId: string, imageId: string) {
  const db = getDb();
  const res = db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND image_id = ?").run(collectionId, imageId);
  if (res.changes > 0) {
    db.prepare("UPDATE images SET saves = MAX(0, saves - 1) WHERE id = ?").run(imageId);
  }
  db.prepare("UPDATE collections SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), collectionId);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM collection_items WHERE image_id = ?").get(imageId) as { n: number }).n;
  return { saved: count > 0, removed: res.changes > 0 };
}

/** Quick-save: toggles the image in the default "Saved" collection. */
export function quickToggleSave(imageId: string) {
  const db = getDb();
  const first = db.prepare("SELECT id FROM collections ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
  const collection = first ? first.id : ensureDefaultCollection().id;
  const inIt = db
    .prepare("SELECT 1 FROM collection_items WHERE collection_id = ? AND image_id = ?")
    .get(collection, imageId);
  if (inIt) return { ...removeFromCollection(collection, imageId), collectionId: collection };
  return { ...addToCollection(collection, imageId), collectionId: collection };
}

export function collectionIdsForImage(imageId: string): string[] {
  return (getDb().prepare("SELECT collection_id FROM collection_items WHERE image_id = ?").all(imageId) as { collection_id: string }[]).map(
    (r) => r.collection_id,
  );
}
