import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { categoryLabel, CATEGORY_BY_ID, NEGATIVE_BASE } from "@/lib/taxonomy";
import type { GenerationJob, Idea, ImageRow } from "@/lib/types";
import { buildIdea, type BrainContext } from "./brain";
import { generateImage, ProviderError, providerStatus } from "./providers";
import { analyze, buildVariants, hamming } from "./imaging";
import { getStorage, mediaRoot } from "./storage";
import { addSpend, logEvent } from "@/lib/repo/settings";

const MAX_PHASH_DISTANCE = Number(process.env.DUP_PHASH_DISTANCE || 6);
/** Anything below this pixel budget is treated as a failed generation. */
const MIN_PIXELS = 320 * 320;

export function getBrainContext(overrides: Partial<BrainContext> = {}): BrainContext {
  const db = getDb();
  const counts: Record<string, number> = {};
  for (const row of db.prepare("SELECT category_id, COUNT(*) AS n FROM images WHERE status='published' GROUP BY category_id").all() as {
    category_id: string;
    n: number;
  }[]) {
    counts[row.category_id] = row.n;
  }
  for (const row of db.prepare("SELECT category_id, COUNT(*) AS n FROM generation_jobs WHERE status IN ('queued','running') GROUP BY category_id").all() as {
    category_id: string;
    n: number;
  }[]) {
    counts[row.category_id] = (counts[row.category_id] ?? 0) + row.n;
  }
  const recent = db
    .prepare("SELECT tokens_json, fingerprint FROM concept_memory ORDER BY created_at DESC LIMIT 220")
    .all() as { tokens_json: string; fingerprint: string }[];
  const emerging = db.prepare("SELECT * FROM categories WHERE is_emerging = 1").all() as {
    id: string;
    label: string;
    description: string;
    accent: string;
    target_share: number;
  }[];
  return {
    counts,
    recentTokens: recent.map((r) => {
      try {
        return JSON.parse(r.tokens_json) as string[];
      } catch {
        return [];
      }
    }),
    recentFingerprints: recent.map((r) => r.fingerprint).filter(Boolean),
    priorityCategories: [],
    emerging: emerging.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      accent: e.accent,
      targetShare: e.target_share,
    })),
    ...overrides,
  };
}

export interface EnqueueOptions {
  count: number;
  categoryId?: string;
  direction?: string;
  campaignId?: string;
  priority?: number;
  brief?: string;
  noveltyThreshold?: number;
  maxAttempts?: number;
}

export function enqueueJobs(opts: EnqueueOptions): GenerationJob[] {
  const db = getDb();
  const now = new Date().toISOString();
  const batchId = `b_${nanoid(8)}`;
  const context = getBrainContext({ direction: opts.direction, priorityCategories: opts.categoryId ? [opts.categoryId] : [] });
  const status = providerStatus();
  const jobs: GenerationJob[] = [];
  const insert = db.prepare(
    `INSERT INTO generation_jobs
      (id, status, priority, attempts, max_attempts, category_id, brief, idea_json, prompt, negative_prompt, aspect, provider, model, campaign_id, batch_id, created_at)
     VALUES (@id, 'queued', @priority, 0, @maxAttempts, @categoryId, @brief, @idea, @prompt, @negative, @aspect, @provider, @model, @campaignId, @batchId, @now)`,
  );

  const localContext = { ...context };
  const tx = db.transaction(() => {
    for (let i = 0; i < opts.count; i++) {
      const idea = buildIdea({
        context: localContext,
        categoryId: opts.categoryId,
        direction: opts.direction,
        noveltyThreshold: opts.noveltyThreshold ?? 0.55,
      });
      // Feed freshly invented concepts back in so a single batch never repeats itself.
      localContext.recentTokens = [idea.tags.concat(idea.subject.split(/\s+/)), ...localContext.recentTokens].slice(0, 260);
      localContext.recentFingerprints = [idea.fingerprint, ...localContext.recentFingerprints].slice(0, 260);

      const id = `jb_${nanoid(12)}`;
      insert.run({
        id,
        priority: opts.priority ?? 50,
        maxAttempts: opts.maxAttempts ?? 3,
        categoryId: idea.categoryId,
        brief: opts.brief ?? opts.direction ?? "",
        idea: JSON.stringify(idea),
        prompt: idea.prompt,
        negative: idea.negativePrompt,
        aspect: idea.ratio.w / idea.ratio.h,
        provider: status.id,
        model: status.model,
        campaignId: opts.campaignId ?? null,
        batchId,
        now,
      });
      jobs.push(db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(id) as GenerationJob);
    }
  });
  tx();

  logEvent("queue", `Queued ${opts.count} generation job${opts.count === 1 ? "" : "s"}${opts.direction ? ` for direction “${opts.direction.slice(0, 90)}”` : ""}`, {
    meta: { count: opts.count, campaignId: opts.campaignId ?? null, batchId, categoryId: opts.categoryId ?? null },
  });
  return jobs;
}

export function claimJob(jobId: string): GenerationJob | null {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db
    .prepare(
      "UPDATE generation_jobs SET status='running', started_at=?, attempts=attempts+1 WHERE id=? AND status='queued'",
    )
    .run(now, jobId);
  if (res.changes === 0) return null;
  return db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(jobId) as GenerationJob;
}

function finishJob(jobId: string, patch: Record<string, unknown>) {
  const db = getDb();
  const fields = Object.keys(patch);
  const sql = `UPDATE generation_jobs SET ${fields.map((f) => `${f} = @${f}`).join(", ")} WHERE id = @id`;
  db.prepare(sql).run({ ...patch, id: jobId });
}

function bumpCampaign(campaignId: string | null, success: boolean) {
  if (!campaignId) return;
  const db = getDb();
  db.prepare(
    `UPDATE campaigns SET completed_count = completed_count + ?, failed_count = failed_count + ? WHERE id = ?`,
  ).run(success ? 1 : 0, success ? 0 : 1, campaignId);
  const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as
    | { completed_count: number; failed_count: number; target_count: number }
    | undefined;
  if (row && row.completed_count + row.failed_count >= row.target_count) {
    db.prepare("UPDATE campaigns SET status='complete', finished_at=? WHERE id=?").run(new Date().toISOString(), campaignId);
    logEvent("campaign", `Campaign finished — ${row.completed_count} published, ${row.failed_count} failed.`, {
      level: row.failed_count > row.completed_count ? "warn" : "success",
      meta: { campaignId },
    });
  }
}

/** Nearest existing perceptual hash — used for near-duplicate rejection. */
function nearestDuplicate(phash: string): { id: string; distance: number } | null {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, phash FROM images WHERE phash != '' ORDER BY published_at DESC LIMIT 600")
    .all() as { id: string; phash: string }[];
  let best: { id: string; distance: number } | null = null;
  for (const r of rows) {
    const d = hamming(phash, r.phash);
    if (!best || d < best.distance) best = { id: r.id, distance: d };
  }
  return best;
}

export interface IngestArgs {
  bytes: Buffer;
  idea: Idea;
  provider?: string;
  model?: string;
  jobId?: string | null;
  campaignId?: string | null;
  costCents?: number;
  seed?: number;
  source?: "agent" | "studio";
  publishedAt?: string;
  skipDuplicateCheck?: boolean;
}

export interface IngestResult {
  id: string;
  duplicateOf?: string;
}

/**
 * The publication pipeline: quality gate → perceptual dedupe → variants →
 * object storage → classification → database → feed.
 */
export async function ingestImage(args: IngestArgs): Promise<IngestResult> {
  const { bytes, idea } = args;
  const db = getDb();
  const analysis = await analyze(bytes);
  if (!analysis.width || !analysis.height || analysis.width * analysis.height < MIN_PIXELS) {
    throw new Error(`Quality check failed: image is ${analysis.width}×${analysis.height}`);
  }

  if (!args.skipDuplicateCheck) {
    const dupe = nearestDuplicate(analysis.phash);
    if (dupe && dupe.distance <= MAX_PHASH_DISTANCE) {
      throw new DuplicateError(dupe.id, dupe.distance);
    }
  }

  const id = `img_${nanoid(12)}`;
  // Externally generated media still gets a real job record, so generation
  // history, costs and provenance stay complete.
  let jobId = args.jobId ?? null;
  if (!jobId) {
    jobId = `jb_${nanoid(12)}`;
    const at = args.publishedAt ?? new Date().toISOString();
    db.prepare(
      `INSERT INTO generation_jobs
        (id, status, priority, attempts, max_attempts, category_id, brief, idea_json, prompt, negative_prompt, aspect,
         provider, model, campaign_id, batch_id, image_id, cost_cents, duration_ms, created_at, started_at, finished_at)
       VALUES (@id, 'succeeded', 70, 1, 1, @categoryId, @brief, @idea, @prompt, @negative, @aspect,
         @provider, @model, @campaignId, @batchId, @imageId, @cost, 0, @at, @at, @at)`,
    ).run({
      id: jobId,
      categoryId: idea.categoryId,
      brief: args.source === "studio" ? "Externally fulfilled concept (manifest)" : "Autonomous generation",
      idea: JSON.stringify(idea),
      prompt: idea.prompt,
      negative: idea.negativePrompt || NEGATIVE_BASE,
      aspect: idea.ratio.w / idea.ratio.h,
      provider: args.provider ?? "external",
      model: args.model ?? "external",
      campaignId: args.campaignId ?? null,
      batchId: `b_${nanoid(8)}`,
      imageId: id,
      cost: args.costCents ?? 0,
      at,
    });
  }
  const variants = await buildVariants(bytes);
  const storage = getStorage();
  const full = await storage.put(`${id}/full.webp`, variants.full, "image/webp");
  const medium = await storage.put(`${id}/medium.webp`, variants.medium, "image/webp");
  const thumb = await storage.put(`${id}/thumb.webp`, variants.thumb, "image/webp");

  const now = new Date().toISOString();
  const publishedAt = args.publishedAt ?? now;
  const category = CATEGORY_BY_ID.get(idea.categoryId);
  const categoryRow = db.prepare("SELECT id FROM categories WHERE id = ?").get(idea.categoryId);
  if (!categoryRow) {
    db.prepare(
      "INSERT INTO categories (id, label, description, accent, target_share, is_emerging, created_at) VALUES (?, ?, ?, ?, 0.01, 1, ?)",
    ).run(idea.categoryId, category?.label ?? categoryLabel(idea.categoryId), category?.description ?? "An emerging direction discovered by the agent.", category?.accent ?? "#C96A3D", now);
  }

  const palette = analysis.palette.length ? analysis.palette : idea.palette.hex;

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO images (
        id, title, description, prompt, negative_prompt, category_id, aesthetic, medium, seed,
        palette_json, tags_json, width, height, aspect, ratio_label, storage_key, medium_key, thumb_key,
        original_url, blur_data, bytes, phash, avg_color, brightness, saturation, provider, model, cost_cents,
        status, source, job_id, campaign_id, batch_id, views, saves, trending_score, created_at, published_at
      ) VALUES (
        @id, @title, @description, @prompt, @negative, @categoryId, @aesthetic, @medium, @seed,
        @palette, @tags, @width, @height, @aspect, @ratioLabel, @storageKey, @mediumKey, @thumbKey,
        @originalUrl, @blurData, @bytes, @phash, @avgColor, @brightness, @saturation, @provider, @model, @cost,
        'published', @source, @jobId, @campaignId, @batchId, 0, 0, @trending, @createdAt, @publishedAt
      )`,
    ).run({
      id,
      title: idea.title,
      description: idea.description,
      prompt: idea.prompt,
      negative: idea.negativePrompt || NEGATIVE_BASE,
      categoryId: idea.categoryId,
      aesthetic: idea.aesthetic,
      medium: idea.medium,
      seed: args.seed ?? null,
      palette: JSON.stringify(palette),
      tags: JSON.stringify(idea.tags),
      width: analysis.width,
      height: analysis.height,
      aspect: analysis.aspect,
      ratioLabel: idea.ratio.label,
      storageKey: full.key,
      mediumKey: medium.key,
      thumbKey: thumb.key,
      originalUrl: full.url,
      blurData: variants.blurData,
      bytes: bytes.length,
      phash: analysis.phash,
      avgColor: analysis.avgColor,
      brightness: analysis.brightness,
      saturation: analysis.saturation,
      provider: args.provider ?? "",
      model: args.model ?? "",
      cost: args.costCents ?? 0,
      source: args.source ?? "agent",
      jobId,
      campaignId: args.campaignId ?? null,
      batchId: `b_${nanoid(8)}`,
      trending: 1,
      createdAt: args.publishedAt ?? now,
      publishedAt,
    });

    const tagStmt = db.prepare("INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)");
    for (const tag of idea.tags) tagStmt.run(id, tag.toLowerCase());

    db.prepare(
      `INSERT INTO images_fts (image_id, title, description, prompt, tags, category, aesthetic, medium)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      idea.title,
      idea.description,
      idea.prompt,
      idea.tags.join(" "),
      categoryLabel(idea.categoryId),
      idea.aesthetic,
      idea.medium,
    );

    db.prepare(
      `INSERT INTO concept_memory (id, image_id, category_id, aesthetic, subject, concept_key, tokens_json, fingerprint, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `cm_${nanoid(10)}`,
      id,
      idea.categoryId,
      idea.aesthetic,
      idea.subject,
      idea.fingerprint,
      JSON.stringify(idea.tags.concat(idea.subject.split(/\s+/))),
      idea.fingerprint,
      now,
    );

    db.prepare("UPDATE categories SET image_count = image_count + 1 WHERE id = ?").run(idea.categoryId);
  });
  insert();

  logEvent(
    "publish",
    `Published “${idea.title}” — ${categoryLabel(idea.categoryId)} · ${idea.aesthetic}${args.model ? ` · ${args.model}` : ""}`,
    { level: "success", meta: { imageId: id, categoryId: idea.categoryId, provider: args.provider, costCents: args.costCents ?? 0 } },
  );

  return { id };
}

export class DuplicateError extends Error {
  duplicateOf: string;
  distance: number;
  constructor(duplicateOf: string, distance: number) {
    super(`Near-duplicate of existing image (perceptual distance ${distance})`);
    this.name = "DuplicateError";
    this.duplicateOf = duplicateOf;
    this.distance = distance;
  }
}

/** Execute one queued job end-to-end. Returns the published image id. */
export async function processJob(jobId: string): Promise<{ ok: boolean; imageId?: string; error?: string; retryable?: boolean }> {
  const db = getDb();
  const job = claimJob(jobId);
  if (!job) return { ok: false, error: "Job was already claimed" };
  const started = Date.now();
  const idea = JSON.parse(job.idea_json) as Idea;

  try {
    logEvent("generate", `Generating “${idea.title}” — ${idea.medium}, ${idea.aesthetic}`, {
      meta: { jobId, categoryId: job.category_id, provider: job.provider, model: job.model },
    });
    const result = await generateImage({
      prompt: job.prompt,
      negativePrompt: job.negative_prompt,
      aspect: job.aspect,
      seed: Date.now() % 1_000_000,
      model: job.model || undefined,
    });

    const ingested = await ingestImage({
      bytes: result.bytes,
      idea,
      provider: result.provider,
      model: result.model,
      jobId,
      campaignId: job.campaign_id,
      costCents: result.costCents,
      seed: result.seed,
    });

    finishJob(jobId, {
      status: "succeeded",
      image_id: ingested.id,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      cost_cents: result.costCents,
      error: null,
    });
    addSpend(result.costCents);
    bumpCampaign(job.campaign_id, true);
    return { ok: true, imageId: ingested.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof ProviderError ? err.retryable : !(err instanceof DuplicateError) ? true : false;
    const attempts = job.attempts;
    const willRetry = retryable && attempts < job.max_attempts;

    if (willRetry) {
      // Re-imagine the concept before retrying so a failure doesn't produce the same frame again.
      const context = getBrainContext();
      const fresh = buildIdea({ context, categoryId: job.category_id ?? undefined, noveltyThreshold: 0.6 });
      finishJob(jobId, {
        status: "queued",
        error: message.slice(0, 500),
        started_at: null,
        prompt: fresh.prompt,
        negative_prompt: fresh.negativePrompt,
        idea_json: JSON.stringify(fresh),
        aspect: fresh.ratio.w / fresh.ratio.h,
      });
      logEvent("error", `Generation failed (attempt ${attempts}/${job.max_attempts}), requeued with a new concept — ${message.slice(0, 180)}`, {
        level: "warn",
        meta: { jobId },
      });
      return { ok: false, error: message, retryable: true };
    }

    finishJob(jobId, {
      status: "failed",
      error: message.slice(0, 500),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    });
    bumpCampaign(job.campaign_id, false);
    logEvent("error", `Generation failed permanently — ${message.slice(0, 220)}`, { level: "error", meta: { jobId } });
    return { ok: false, error: message, retryable: false };
  }
}

/** Write prompts to a manifest so an external studio (e.g. a human-guided agent) can fulfil them. */
export async function exportManifest(count = 12, direction?: string): Promise<{ file: string; prompts: { prompt: string; negativePrompt: string; aspect: number; idea: Idea }[] }> {
  const context = getBrainContext({ direction });
  const prompts = Array.from({ length: count }, () => {
    const idea = buildIdea({ context, direction });
    return { prompt: idea.prompt, negativePrompt: idea.negativePrompt, aspect: idea.ratio.w / idea.ratio.h, idea };
  });
  const dir = path.join(mediaRoot, "..", "manifests");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(file, JSON.stringify({ createdAt: new Date().toISOString(), direction: direction ?? null, prompts }, null, 2));
  return { file, prompts };
}

export function requeueStuckJobs(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const res = db
    .prepare("UPDATE generation_jobs SET status='queued', started_at=NULL WHERE status='running' AND started_at < ?")
    .run(cutoff);
  return res.changes;
}

export function recentImageRows(limit = 12): ImageRow[] {
  return getDb().prepare("SELECT * FROM images WHERE status='published' ORDER BY published_at DESC LIMIT ?").all(limit) as ImageRow[];
}

const VARIATION_ANGLES = [
  "shot from a low three-quarter angle, warmer key light",
  "reimagined in a cooler moonlit palette at night",
  "an entirely different composition, negative space on the left",
  "a tighter macro crop of the most tactile detail",
  "the same concept in a monochrome paper-and-ink treatment",
  "a wider environmental frame that reveals the surrounding world",
  "a different material substitution with the same silhouette",
  "the same concept translated into an editorial magazine spread",
];

/** Ask the agent to riff on an existing image, keeping its category and DNA. */
export function enqueueVariations(imageId: string, count = 6): { jobs: GenerationJob[]; direction: string } {
  const db = getDb();
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(imageId) as ImageRow | undefined;
  if (!row) throw new Error("Image not found");
  const tags = JSON.parse(row.tags_json || "[]") as string[];
  const palette = JSON.parse(row.palette_json || "[]") as string[];
  const direction = `Variations of “${row.title}” — ${row.aesthetic}, ${row.category_id.replace(/-/g, " ")}`;
  const status = providerStatus();
  const now = new Date().toISOString();
  const batchId = `b_${nanoid(8)}`;
  const campaignId = null;

  const insert = db.prepare(
    `INSERT INTO generation_jobs
      (id, status, priority, attempts, max_attempts, category_id, brief, idea_json, prompt, negative_prompt, aspect, provider, model, campaign_id, batch_id, created_at)
     VALUES (@id, 'queued', 85, 0, 3, @categoryId, @brief, @idea, @prompt, @negative, @aspect, @provider, @model, @campaignId, @batchId, @now)`,
  );
  const jobs: GenerationJob[] = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const angle = VARIATION_ANGLES[i % VARIATION_ANGLES.length];
      const prompt = `${row.prompt}. New interpretation: ${angle}. Keep the ${row.aesthetic} art direction and the palette of ${palette.slice(0, 3).join(", ")}.`;
      const idea: Idea = {
        categoryId: row.category_id,
        subcategory: row.aesthetic,
        subject: `${row.title} — variation ${i + 1}`,
        medium: row.medium || "art-directed visual",
        aesthetic: row.aesthetic,
        lighting: row.medium,
        palette: { name: "derived", hex: palette.length ? palette : ["#1a1512", "#4a3a2e", "#c96a3d"] },
        composition: angle,
        material: "as seen in the source image",
        mood: "reinvented",
        details: ["variation study", "consistent art direction"],
        ratio: { label: row.ratio_label, w: row.width, h: row.height },
        prompt,
        negativePrompt: row.negative_prompt || NEGATIVE_BASE,
        title: `${row.title} — Variation ${String(i + 1).padStart(2, "0")}`,
        description: `An agent variation on “${row.title}”: ${angle}.`,
        tags: [...new Set([...tags.slice(0, 8), "variation", row.category_id])],
        novelty: 0.7,
        fingerprint: `v${Date.now()}${i}`,
      };
      const id = `jb_${nanoid(12)}`;
      insert.run({
        id,
        categoryId: row.category_id,
        brief: direction,
        idea: JSON.stringify(idea),
        prompt,
        negative: row.negative_prompt || NEGATIVE_BASE,
        aspect: row.aspect || 1,
        provider: status.id,
        model: status.model,
        campaignId,
        batchId,
        now,
      });
      jobs.push(db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(id) as GenerationJob);
    }
  });
  tx();
  logEvent("idea", `Agent is riffing: ${count} variations queued for “${row.title}”.`, { meta: { imageId, count } });
  return { jobs, direction };
}
