import { NextResponse } from "next/server";
import { ensureRuntime, tick } from "@/lib/agent/runtime";

export const dynamic = "force-dynamic";

/**
 * External scheduler entry point (cron, Supabase scheduled function, …).
 * Requires AGENT_TICK_TOKEN when set, so the queue cannot be driven by
 * anonymous traffic.
 */
export async function POST(request: Request) {
  const token = process.env.AGENT_TICK_TOKEN;
  if (token) {
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("token");
    if (provided !== token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ensureRuntime();
  await tick();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export async function GET() {
  ensureRuntime();
  return NextResponse.json({
    ok: true,
    hint: "POST to this endpoint to drive a tick. Set AGENT_TICK_TOKEN to protect it.",
  });
}
