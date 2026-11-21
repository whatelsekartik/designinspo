import { NextResponse } from "next/server";
import { ensureRuntime, tick } from "@/lib/agent/runtime";
import { getSettings, logEvent, setSettings, type StoredSettings } from "@/lib/repo/settings";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  ensureRuntime();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<StoredSettings> = {};

  const number = (key: string, min: number, max: number, integer = true) => {
    if (body[key] === undefined) return null;
    const n = Number(body[key]);
    if (!Number.isFinite(n)) return `${key} must be a number`;
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    (patch as Record<string, unknown>)[key] = clamped;
    return null;
  };

  const errors = [
    number("batchSize", 1, 200),
    number("frequencySeconds", 10, 86400),
    number("budgetCents", 0, 10_000_000),
    number("concurrency", 1, 8),
    number("noveltyThreshold", 0, 0.95, false),
  ].filter(Boolean);
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  if (typeof body.customDirection === "string") patch.customDirection = body.customDirection.slice(0, 600);
  if (typeof body.allowEmerging === "boolean") patch.allowEmerging = body.allowEmerging;
  if (Array.isArray(body.priorityCategories)) {
    const ids = body.priorityCategories.filter((c): c is string => typeof c === "string").slice(0, 40);
    const known = new Set((getDb().prepare("SELECT id FROM categories").all() as { id: string }[]).map((c) => c.id));
    patch.priorityCategories = ids.filter((id) => known.has(id));
  }
  if (typeof body.running === "boolean") {
    patch.running = body.running;
    patch.pausedReason = body.running ? null : "Paused by operator.";
  }

  const updated = setSettings(patch);
  if (typeof body.running === "boolean") {
    logEvent("control", body.running ? "Agent resumed from settings." : "Agent paused from settings.", { level: body.running ? "success" : "warn" });
    void tick();
  }
  if (Object.keys(patch).some((k) => ["batchSize", "frequencySeconds", "budgetCents", "concurrency", "noveltyThreshold"].includes(k))) {
    logEvent("control", "Agent configuration updated.", {
      meta: {
        batchSize: updated.batchSize,
        frequencySeconds: updated.frequencySeconds,
        budgetCents: updated.budgetCents,
        concurrency: updated.concurrency,
        noveltyThreshold: updated.noveltyThreshold,
      },
    });
  }
  return NextResponse.json({ settings: { ...updated, spentCents: getSettings().spentCents } });
}
