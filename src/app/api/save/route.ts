import { NextResponse } from "next/server";
import { quickToggleSave } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { imageId?: string };
  if (!body.imageId) return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  const result = quickToggleSave(body.imageId);
  return NextResponse.json(result);
}
