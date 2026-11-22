import { NextResponse } from "next/server";
import { control, ensureRuntime } from "@/lib/agent/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureRuntime();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    count?: number;
    categoryId?: string;
    direction?: string;
  };
  const allowed = ["start", "pause", "resume", "batch", "reset-budget"];
  if (!body.action || !allowed.includes(body.action)) {
    return NextResponse.json({ error: `action must be one of ${allowed.join(", ")}` }, { status: 400 });
  }
  const result = await control(body.action as "start", {
    count: body.count,
    categoryId: body.categoryId,
    direction: body.direction,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
