import { NextResponse } from "next/server";
import { listEvents } from "@/lib/repo/settings";
import type { AgentEventKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 40), 200);
  const kind = url.searchParams.get("kind") as AgentEventKind | null;
  return NextResponse.json({ events: listEvents(limit, kind ?? undefined) }, { headers: { "Cache-Control": "no-store" } });
}
