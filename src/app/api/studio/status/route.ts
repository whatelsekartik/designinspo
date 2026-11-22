import { NextResponse } from "next/server";
import { ensureRuntime, getAgentStatus } from "@/lib/agent/runtime";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureRuntime();
  const status = await getAgentStatus();
  const settings = getSettings();
  return NextResponse.json(
    { ...status, settings: { ...status.settings, spentCents: settings.spentCents, runtimeStartedAt: settings.runtimeStartedAt } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
