import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import type { AgentEvent, AgentEventKind, AgentSettings } from "@/lib/types";

export const DEFAULT_SETTINGS: AgentSettings & { spentCents: number; lastTick: string | null; pausedReason: string | null; runtimeStartedAt: string | null } = {
  running: false,
  batchSize: 10,
  frequencySeconds: 90,
  budgetCents: 5000,
  concurrency: 2,
  noveltyThreshold: 0.55,
  priorityCategories: [],
  allowEmerging: true,
  customDirection: "",
  spentCents: 0,
  lastTick: null,
  pausedReason: null,
  runtimeStartedAt: null,
};

export type StoredSettings = typeof DEFAULT_SETTINGS;

export function getSettings(): StoredSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in out)) continue;
    try {
      (out as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      (out as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return out;
}

export function setSettings(patch: Partial<StoredSettings>): StoredSettings {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  );
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [k, v] of entries) stmt.run(k, JSON.stringify(v), now);
  });
  tx(Object.entries(patch));
  return getSettings();
}

export function addSpend(cents: number) {
  const s = getSettings();
  setSettings({ spentCents: Math.round((s.spentCents + cents) * 100) / 100 });
}

export function logEvent(kind: AgentEventKind, message: string, opts: { level?: AgentEvent["level"]; meta?: unknown } = {}) {
  const db = getDb();
  const id = `ev_${nanoid(12)}`;
  db.prepare("INSERT INTO agent_events (id, kind, level, message, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    kind,
    opts.level ?? (kind === "error" ? "error" : kind === "publish" ? "success" : "info"),
    message,
    JSON.stringify(opts.meta ?? {}),
    new Date().toISOString(),
  );
  return id;
}

export function listEvents(limit = 40, kind?: AgentEventKind): AgentEvent[] {
  const db = getDb();
  const rows = kind
    ? (db.prepare("SELECT * FROM agent_events WHERE kind = ? ORDER BY created_at DESC LIMIT ?").all(kind, limit) as AgentEvent[])
    : (db.prepare("SELECT * FROM agent_events ORDER BY created_at DESC LIMIT ?").all(limit) as AgentEvent[]);
  return rows;
}
