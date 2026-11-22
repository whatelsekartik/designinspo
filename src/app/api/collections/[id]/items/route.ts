import { NextResponse } from "next/server";
import { addToCollection, getCollection, removeFromCollection } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getCollection(id)) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { imageId?: string };
  if (!body.imageId) return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  const result = addToCollection(id, body.imageId);
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imageId = new URL(request.url).searchParams.get("imageId");
  if (!imageId) return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  const result = removeFromCollection(id, imageId);
  return NextResponse.json(result);
}
