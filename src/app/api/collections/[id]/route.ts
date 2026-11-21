import { NextResponse } from "next/server";
import { deleteCollection, getCollection, updateCollection } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = getCollection(id);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  return NextResponse.json({ collection });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string; accent?: string };
  const collection = updateCollection(id, body);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  return NextResponse.json({ collection });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getCollection(id)) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  deleteCollection(id);
  return NextResponse.json({ ok: true });
}
