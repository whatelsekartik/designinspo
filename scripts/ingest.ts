/**
 * Ingest externally generated images through the real publication pipeline.
 *
 *   npm run seed                                  # curated initial library
 *   npm run ingest -- --manifest file.json --dir ./images
 *
 * The manifest holds one entry per image:
 *   { "file": "01.jpg", "prompt": "...", "idea": { …full agent idea… } }
 *
 * Every image goes through: quality check → perceptual dedupe → responsive
 * variants → object storage → classification → database → discovery feed.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { ingestImage, DuplicateError } from "@/lib/agent/pipeline";
import type { Idea } from "@/lib/types";

interface ManifestItem {
  file: string;
  idea?: Idea;
  prompt?: string;
  title?: string;
  categoryId?: string;
  aspect?: number;
}

interface Manifest {
  createdAt?: string;
  direction?: string | null;
  items: ManifestItem[];
}

function arg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.split("=").slice(1).join("=") : fallback;
}

function resolveIdea(item: ManifestItem): Idea {
  if (item.idea) {
    return {
      ...item.idea,
      prompt: item.idea.prompt || item.prompt || "",
      title: item.idea.title || item.title || "Untitled",
      tags: item.idea.tags ?? [],
      palette: item.idea.palette ?? { name: "derived", hex: [] },
      details: item.idea.details ?? [],
    };
  }
  return {
    categoryId: item.categoryId ?? "experimental-design",
    subcategory: "Studio",
    subject: item.title ?? "Untitled",
    medium: "art-directed visual",
    aesthetic: "studio selection",
    lighting: "natural light",
    palette: { name: "derived", hex: [] },
    composition: "considered composition",
    material: "mixed media",
    mood: "considered",
    details: [],
    ratio: { label: "1:1", w: 1, h: 1 },
    prompt: item.prompt ?? "",
    negativePrompt: "",
    title: item.title ?? "Untitled",
    description: "",
    tags: [],
    novelty: 1,
    fingerprint: `ext-${item.file}`,
  };
}

async function main() {
  const manifestPath = path.resolve(process.cwd(), arg("manifest", ".seed/manifest.json")!);
  const imageDir = path.resolve(process.cwd(), arg("dir", ".seed/raw")!);
  const provider = arg("provider", "arena-studio")!;
  const model = arg("model", "arena-image-1")!;
  const strict = process.argv.includes("--strict");

  if (!fs.existsSync(manifestPath)) {
    console.error(`✖ Manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  const db = getDb();

  const statePath = path.join(path.dirname(manifestPath), "ingested.json");
  const ingested: Record<string, string> = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};

  let published = 0;
  let skipped = 0;
  let duplicates = 0;
  let failed = 0;

  for (const item of manifest.items) {
    if (ingested[item.file] && db.prepare("SELECT 1 FROM images WHERE id = ?").get(ingested[item.file])) {
      skipped++;
      continue;
    }
    const filePath = path.join(imageDir, item.file);
    if (!fs.existsSync(filePath)) {
      console.log(`· missing ${item.file} — skipped`);
      skipped++;
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    try {
      const idea = resolveIdea(item);
      const result = await ingestImage({
        bytes,
        idea,
        provider,
        model,
        costCents: 0,
        source: "studio",
        publishedAt: new Date().toISOString(),
      });
      ingested[item.file] = result.id;
      published++;
      console.log(`✔ published ${item.file} → ${result.id} · ${idea.title}`);
    } catch (err) {
      if (err instanceof DuplicateError) {
        duplicates++;
        console.warn(`≈ near-duplicate ${item.file} (of ${err.duplicateOf}) — skipped`);
      } else {
        failed++;
        console.error(`✖ ${item.file}: ${err instanceof Error ? err.message : String(err)}`);
        if (strict) process.exit(1);
      }
    }
  }

  fs.writeFileSync(statePath, JSON.stringify(ingested, null, 2));
  const total = (db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number }).n;
  console.log(`\n━━ Published ${published} · duplicates ${duplicates} · skipped ${skipped} · failed ${failed}`);
  console.log(`   Library now holds ${total} images.`);
  console.log(`   Run "npm run dev" and open the Discover feed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
