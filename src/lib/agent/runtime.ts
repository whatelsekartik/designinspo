import { getDb } from "@/lib/db";
import { categoryLabel, EMERGING_SEEDS } from "@/lib/taxonomy";
import type { AgentEvent, AgentStatus, Campaign, GenerationJob } from "@/lib/types";
import { enqueueJobs, getBrainContext, processJob, requeueStuckJobs } from "./pipeline";
import { providerStatus } from "./providers";
import { addSpend, getSettings, listEvents, logEvent, setSettings } from "@/lib/repo/settings";
import { getCategories, getFeed, refreshTrending } from "@/lib/repo/images";
import { getStorage } from "./storage";
import { ensureDefaultCollection } from "@/lib/repo/collections";

interface RuntimeState {
  timer: NodeJS.Timeout | null;
  active: Set<string>;
  ticking: boolean;
  lastBatchAt: number;
  ticks: number;
  booted: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __infiniteAgent: RuntimeState | undefined;
}

function state(): RuntimeState {
  if (!globalThis.__infiniteAgent) {
    globalThis.__infiniteAgent = { timer: null, active: new Set(), ticking: false, lastBatchAt: 0, ticks: 0, booted: false };
  }
  return globalThis.__infiniteAgent;
}

const TICK_MS = 12_000;

export function ensureRuntime() {
  const s = state();
  if (s.booted) return;
  s.booted = true;
  bootstrap();
  s.timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Never keep the Node process alive just for the agent timer.
  s.timer.unref?.();
}

function bootstrap() {
  ensureDefaultCollection();
  const status = providerStatus();
  const settings = getSettings();
  if (!settings.runtimeStartedAt) {
    if (status.configured) {
      const initial = Math.max(1, Number(process.env.INITIAL_BATCH_SIZE || 40));
      const batch = Math.min(initial, Math.max(4, Math.floor(settings.budgetCents / 6)));
      setSettings({ running: true, runtimeStartedAt: new Date().toISOString(), batchSize: Math.min(20, batch) });
      logEvent("system", `Generation provider connected (${status.label} · ${status.model}). Initial population pipeline started with ${batch} queued concepts.`, {
        level: "success",
        meta: { provider: status.id },
      });
      enqueueJobs({ count: batch, priority: 80, brief: "Initial library population" });
    } else {
      setSettings({ runtimeStartedAt: new Date().toISOString() });
      logEvent(
        "system",
        "Agent is idle: no image-generation provider is configured. Add IMAGE_PROVIDER + an API key (see Setup) and the queue will start draining automatically.",
        { level: "warn" },
      );
    }
  }
  if (status.configured && getSettings().running) void tick();
}

export async function tick() {
  const s = state();
  if (s.ticking) return;
  s.ticking = true;
  try {
    s.ticks++;
    const settings = getSettings();
    const status = providerStatus();

    if (s.ticks % 25 === 0) requeueStuckJobs();
    if (s.ticks % 12 === 0) refreshTrending();
    if (s.ticks % 5 === 0 && settings.running && status.configured) campaignProgress();

    if (!status.configured) {
      if (settings.running) {
        setSettings({ running: false, pausedReason: "Image-generation provider is not configured." });
      }
      return;
    }

    if (!settings.running) return;

    if (settings.spentCents >= settings.budgetCents) {
      setSettings({ running: false, pausedReason: "Generation budget reached." });
      logEvent("control", `Paused automatically — budget of $${(settings.budgetCents / 100).toFixed(2)} reached.`, { level: "warn" });
      return;
    }
    if (settings.pausedReason) setSettings({ pausedReason: null });

    const db = getDb();
    const queued = (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE status='queued'").get() as { n: number }).n;
    const now = Date.now();
    if (queued < settings.batchSize && now - s.lastBatchAt > settings.frequencySeconds * 1000) {
      s.lastBatchAt = now;
      const missing = Math.max(settings.batchSize - queued, 1);
      const direction = settings.customDirection.trim();
      const context = getBrainContext({ priorityCategories: settings.priorityCategories, direction });
      const weightedCategories = settings.priorityCategories.length
        ? settings.priorityCategories.filter((c) => context.counts[c] !== undefined || true)
        : [];
      if (weightedCategories.length && Math.random() < 0.55) {
        for (let i = 0; i < missing; i++) {
          const cat = weightedCategories[i % weightedCategories.length];
          enqueueJobs({ count: 1, categoryId: cat, direction, noveltyThreshold: settings.noveltyThreshold, brief: direction || "Priority category rotation" });
        }
      } else {
        enqueueJobs({ count: missing, direction, noveltyThreshold: settings.noveltyThreshold, brief: direction || "Autonomous exploration" });
      }
      maybeSpawnEmergingCategory(settings.allowEmerging);
    }

    await pump();
  } catch (err) {
    logEvent("error", `Agent tick failed — ${err instanceof Error ? err.message : String(err)}`, { level: "error" });
  } finally {
    s.ticking = false;
  }
}

async function pump() {
  const s = state();
  const settings = getSettings();
  if (!settings.running) return;
  if (!providerStatus().configured) return;
  const db = getDb();
  const slots = Math.max(0, settings.concurrency - s.active.size);
  if (slots <= 0) return;

  const jobs = db
    .prepare("SELECT id, cost_cents FROM generation_jobs WHERE status='queued' ORDER BY priority DESC, created_at ASC LIMIT ?")
    .all(slots) as { id: string; cost_cents: number }[];

  for (const job of jobs) {
    const fresh = getSettings();
    if (!fresh.running) return;
    if (fresh.spentCents >= fresh.budgetCents) {
      setSettings({ running: false, pausedReason: "Generation budget reached." });
      return;
    }
    s.active.add(job.id);
    void processJob(job.id)
      .then(() => {
        if (getSettings().spentCents >= getSettings().budgetCents) {
          setSettings({ running: false, pausedReason: "Generation budget reached." });
          logEvent("control", "Paused automatically — generation budget reached.", { level: "warn" });
        }
      })
      .catch((err) => {
        logEvent("error", `Worker crashed on a job — ${err instanceof Error ? err.message : String(err)}`, { level: "error" });
      })
      .finally(() => {
        s.active.delete(job.id);
        setTimeout(() => void pump(), 250);
      });
  }
}

export function maybeSpawnEmergingCategory(allow: boolean) {
  if (!allow) return null;
  const db = getDb();
  const published = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE status='published'").get() as { n: number }).n;
  const existing = new Set((db.prepare("SELECT id FROM categories").all() as { id: string }[]).map((c) => c.id));
  const available = EMERGING_SEEDS.filter((seed) => !existing.has(slug(seed.label)));
  if (!available.length) return null;
  // Introduce a new direction roughly every 8 published images.
  const emergingCount = (db.prepare("SELECT COUNT(*) AS n FROM categories WHERE is_emerging = 1").get() as { n: number }).n;
  if (published < 6 || emergingCount >= Math.floor(published / 8) + 1) return null;
  const seed = available[0];
  const id = slug(seed.label);
  db.prepare(
    "INSERT INTO categories (id, label, description, accent, target_share, is_emerging, created_at) VALUES (?, ?, ?, ?, 0.015, 1, ?)",
  ).run(id, seed.label, `An emerging direction the agent discovered: ${seed.hint}.`, seed.accent, new Date().toISOString());
  logEvent("idea", `Discovered a new visual direction: ${seed.label} — ${seed.hint}.`, { level: "success", meta: { categoryId: id } });
  return id;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export interface ControlResult {
  ok: boolean;
  message: string;
  status?: AgentStatus;
}

export async function control(
  action: "start" | "pause" | "resume" | "batch" | "reset-budget",
  opts: { count?: number; categoryId?: string; direction?: string } = {},
): Promise<ControlResult> {
  const status = providerStatus();
  const settings = getSettings();
  ensureRuntime();

  if (action === "start" || action === "resume") {
    if (!status.configured) {
      return {
        ok: false,
        message: `Image-generation provider is not configured. Missing: ${status.missing.join(", ")}`,
      };
    }
    if (settings.spentCents >= settings.budgetCents) {
      return { ok: false, message: "Generation budget is exhausted. Raise the budget to continue." };
    }
    setSettings({ running: true, pausedReason: null });
    logEvent("control", action === "start" ? "Agent started." : "Agent resumed.", { level: "success" });
    void tick();
    return { ok: true, message: action === "start" ? "Agent started" : "Agent resumed" };
  }

  if (action === "pause") {
    setSettings({ running: false, pausedReason: "Paused by operator." });
    logEvent("control", "Agent paused by operator.", { level: "warn" });
    return { ok: true, message: "Agent paused" };
  }

  if (action === "reset-budget") {
    setSettings({ spentCents: 0, pausedReason: null });
    logEvent("control", "Spend counter reset.", { level: "warn" });
    return { ok: true, message: "Spend counter reset" };
  }

  if (action === "batch") {
    if (!status.configured) {
      // No provider: export a manifest of prompts instead of pretending to generate.
      const { exportManifest } = await import("./pipeline");
      const manifest = await exportManifest(opts.count ?? 12, opts.direction);
      logEvent("queue", `Provider not configured — wrote ${manifest.prompts.length} prompts to an external generation manifest.`, {
        level: "warn",
        meta: { file: manifest.file },
      });
      return {
        ok: false,
        message: `Provider not configured. Exported ${manifest.prompts.length} prompts to storage/manifests for external generation.`,
      };
    }
    const count = Math.max(1, Math.min(opts.count ?? settings.batchSize, 200));
    const jobs = enqueueJobs({
      count,
      categoryId: opts.categoryId,
      direction: opts.direction,
      priority: 90,
      brief: "Manual batch",
    });
    if (!getSettings().running) setSettings({ running: true, pausedReason: null });
    void tick();
    return { ok: true, message: `Queued ${jobs.length} generations — the worker is processing them now.` };
  }

  return { ok: false, message: "Unknown action" };
}

export async function createCampaign(direction: string, targetCount = 40, categories: string[] = []): Promise<Campaign> {
  const db = getDb();
  const id = `cp_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const title = direction.length > 64 ? `${direction.slice(0, 61)}…` : direction;
  db.prepare(
    "INSERT INTO campaigns (id, title, direction, categories_json, target_count, completed_count, failed_count, status, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, 'active', ?)",
  ).run(id, title, direction, JSON.stringify(categories), targetCount, now);
  logEvent("campaign", `Campaign created — “${title}” targeting ${targetCount} images.`, {
    level: "success",
    meta: { campaignId: id },
  });

  const status = providerStatus();
  if (status.configured) {
    const chunk = Math.min(targetCount, 60);
    enqueueJobs({ count: chunk, direction, campaignId: id, priority: 95, brief: direction, maxAttempts: 3 });
    if (targetCount > chunk) {
      // The remainder is topped up by the runtime as the queue drains.
      db.prepare("UPDATE campaigns SET target_count = target_count").run();
    }
    setSettings({ running: true, pausedReason: null, customDirection: direction });
    void tick();
  } else {
    logEvent("campaign", "Campaign saved. It will start generating as soon as a provider is configured.", { level: "warn", meta: { campaignId: id } });
  }
  return db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign;
}

export function campaignProgress() {
  const db = getDb();
  const active = db.prepare("SELECT * FROM campaigns WHERE status='active'").all() as Campaign[];
  for (const c of active) {
    const done = c.completed_count + c.failed_count;
    if (done >= c.target_count) {
      db.prepare("UPDATE campaigns SET status='complete', finished_at=? WHERE id=?").run(new Date().toISOString(), c.id);
      continue;
    }
    const inFlight = (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE campaign_id=? AND status IN ('queued','running')").get(c.id) as { n: number }).n;
    if (inFlight === 0) {
      const remaining = Math.min(c.target_count - done, 40);
      if (remaining > 0) {
        enqueueJobs({ count: remaining, direction: c.direction, campaignId: c.id, priority: 92, brief: c.direction });
        logEvent("campaign", `Campaign topped up with ${remaining} more jobs.`, { meta: { campaignId: c.id } });
      }
    }
  }
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const db = getDb();
  const settings = getSettings();
  const status = providerStatus();

  const counts = {
    total: (db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number }).n,
    published: (db.prepare("SELECT COUNT(*) AS n FROM images WHERE status='published'").get() as { n: number }).n,
    generating: (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE status='running'").get() as { n: number }).n,
    queued: (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE status='queued'").get() as { n: number }).n,
    failed: (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE status='failed'").get() as { n: number }).n,
    saved: (db.prepare("SELECT COUNT(*) AS n FROM collection_items").get() as { n: number }).n,
    collections: (db.prepare("SELECT COUNT(*) AS n FROM collections").get() as { n: number }).n,
    today: (db.prepare("SELECT COUNT(*) AS n FROM images WHERE published_at >= date('now')").get() as { n: number }).n,
    lastHour: (db.prepare("SELECT COUNT(*) AS n FROM images WHERE published_at >= datetime('now','-1 hour')").get() as { n: number }).n,
    campaigns: (db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE status='active'").get() as { n: number }).n,
  };

  const seriesRows = db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H', published_at) AS t, COUNT(*) AS n FROM images
       WHERE published_at >= datetime('now','-23 hours') GROUP BY t ORDER BY t ASC`,
    )
    .all() as { t: string; n: number }[];
  const seriesMap = new Map(seriesRows.map((r) => [r.t, r.n]));
  const series: { t: string; n: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600_000);
    const key = d.toISOString().slice(0, 13);
    series.push({ t: key, n: seriesMap.get(key) ?? 0 });
  }
  const dayCount = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE published_at >= datetime('now','-7 days')").get() as { n: number }).n;
  const hourCount = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE published_at >= datetime('now','-24 hours')").get() as { n: number }).n;

  const cats = getCategories();
  const publishedTotal = Math.max(1, cats.reduce((a, c) => a + c.image_count, 0));

  const queue = db
    .prepare(
      `SELECT * FROM generation_jobs ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
        created_at DESC LIMIT 14`,
    )
    .all() as GenerationJob[];

  const events = listEvents(30) as AgentEvent[];
  const campaigns = db.prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 6").all() as Campaign[];
  const recent = getFeed({ sort: "newest", limit: 8 }).images;

  let storageBytes = 0;
  try {
    storageBytes = (await getStorage().usage()).bytes;
  } catch {
    storageBytes = 0;
  }
  void storageBytes;

  const avgCost =
    (db.prepare("SELECT AVG(cost_cents) AS c FROM images WHERE cost_cents > 0").get() as { c: number | null }).c ?? 0;

  let runtime: AgentStatus["runtime"] = settings.running ? "running" : "paused";
  if (!status.configured) runtime = "awaiting_provider";
  if (settings.running && !status.configured) runtime = "paused";

  return {
    runtime,
    provider: {
      configured: status.configured,
      id: status.id,
      label: status.label,
      model: status.model,
      missing: status.missing,
      supported: status.supported,
    },
    counts,
    rate: {
      perHour: Math.round((hourCount / 24) * 10) / 10,
      perDay: Math.round(dayCount / 7),
      series,
    },
    spend: {
      spentCents: Math.round(settings.spentCents * 100) / 100,
      budgetCents: settings.budgetCents,
      costPerImageCents: Math.round(avgCost * 100) / 100,
    },
    settings: {
      running: settings.running,
      batchSize: settings.batchSize,
      frequencySeconds: settings.frequencySeconds,
      budgetCents: settings.budgetCents,
      concurrency: settings.concurrency,
      noveltyThreshold: settings.noveltyThreshold,
      priorityCategories: settings.priorityCategories,
      allowEmerging: settings.allowEmerging,
      customDirection: settings.customDirection,
    },
    categories: cats.map((c) => ({
      id: c.id,
      label: c.label,
      accent: c.accent,
      count: c.image_count,
      share: Math.round((c.image_count / publishedTotal) * 1000) / 10,
      targetShare: Math.round(c.target_share * 1000) / 10,
      isEmerging: !!c.is_emerging,
      priority: settings.priorityCategories.includes(c.id) ? 1 : 0,
    })),
    queue,
    recent,
    events,
    campaigns,
    pausedReason: settings.pausedReason,
  };
}

export function appSpend(cents: number) {
  addSpend(cents);
}

export function categoryName(id: string) {
  return categoryLabel(id);
}
