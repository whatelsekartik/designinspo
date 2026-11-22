import { NextResponse } from "next/server";
import { enqueueVariations } from "@/lib/agent/pipeline";
import { providerStatus } from "@/lib/agent/providers";
import { ensureRuntime, tick } from "@/lib/agent/runtime";
import { getSettings, setSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureRuntime();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { count?: number };
  const status = providerStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        error: "The agent needs an image-generation provider before it can create variations.",
        missing: status.missing,
        setup: true,
      },
      { status: 409 },
    );
  }
  try {
    const count = Math.max(1, Math.min(Number(body.count) || 6, 24));
    const { jobs } = enqueueVariations(id, count);
    if (!getSettings().running) setSettings({ running: true, pausedReason: null });
    void tick();
    return NextResponse.json({ ok: true, queued: jobs.length, message: `${jobs.length} variations queued — the agent is on it.` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not queue variations" }, { status: 400 });
  }
}
