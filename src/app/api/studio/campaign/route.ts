import { NextResponse } from "next/server";
import { createCampaign, ensureRuntime } from "@/lib/agent/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureRuntime();
  const body = (await request.json().catch(() => ({}))) as { direction?: string; target?: number; categories?: string[] };
  const direction = (body.direction || "").trim();
  if (direction.length < 6) {
    return NextResponse.json({ error: "Describe the creative direction in at least a few words." }, { status: 400 });
  }
  const target = Math.max(1, Math.min(Number(body.target) || 40, 2000));
  const campaign = await createCampaign(direction, target, Array.isArray(body.categories) ? body.categories : []);
  return NextResponse.json({ campaign }, { status: 201 });
}
