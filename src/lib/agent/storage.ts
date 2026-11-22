import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

export interface StoredVariant {
  key: string;
  url: string;
  bytes: number;
}

export interface StorageDriver {
  id: string;
  label: string;
  put(key: string, bytes: Buffer, contentType: string): Promise<StoredVariant>;
  url(key: string): string;
  usage(): Promise<{ objects: number; bytes: number }>;
}

const MEDIA_ROOT = path.resolve(process.cwd(), process.env.MEDIA_DIR || "./storage/media");

class LocalStorage implements StorageDriver {
  id = "local";
  label = "Local object storage (./storage/media)";

  async put(key: string, bytes: Buffer, _contentType: string): Promise<StoredVariant> {
    const file = path.join(MEDIA_ROOT, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return { key, url: this.url(key), bytes: bytes.length };
  }

  url(key: string): string {
    if (!key) return "";
    if (key.startsWith("http")) return key;
    return `/media/${key.replace(/^\/+/, "")}`;
  }

  async usage() {
    let objects = 0;
    let bytes = 0;
    async function walk(dir: string) {
      let entries: fsSync.Dirent[] = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else {
          const s = await fs.stat(p);
          objects++;
          bytes += s.size;
        }
      }
    }
    await walk(MEDIA_ROOT);
    return { objects, bytes };
  }
}

class SupabaseStorage implements StorageDriver {
  id = "supabase";
  label = "Supabase Storage";
  private base: string;
  private bucket: string;
  private key: string;

  constructor() {
    this.base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    this.bucket = process.env.SUPABASE_MEDIA_BUCKET || "infinite-media";
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredVariant> {
    if (!this.base || !this.key) throw new Error("Supabase storage is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    const res = await fetch(`${this.base}/storage/v1/object/${this.bucket}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        apikey: this.key,
        "Content-Type": contentType,
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return { key, url: this.url(key), bytes: bytes.length };
  }

  url(key: string): string {
    if (!key) return "";
    if (key.startsWith("http")) return key;
    return `${this.base}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  async usage() {
    return { objects: 0, bytes: 0 };
  }
}

export function getStorage(): StorageDriver {
  return process.env.STORAGE_DRIVER === "supabase" ? new SupabaseStorage() : new LocalStorage();
}

export function mediaUrl(key: string): string {
  if (!key) return "";
  if (key.startsWith("http")) return key;
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE || "/media";
  return `${base.replace(/\/$/, "")}/${key.replace(/^\/+/, "")}`;
}

export const mediaRoot = MEDIA_ROOT;
