import { NextResponse } from "next/server";
import { createCollection, listCollections } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ collections: listCollections() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string; accent?: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "A collection needs a name." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Name must be 60 characters or fewer." }, { status: 400 });
  const collection = createCollection(name, body.description ?? "", body.accent);
  return NextResponse.json({ collection }, { status: 201 });
}
