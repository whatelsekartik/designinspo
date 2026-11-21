import { NextResponse } from "next/server";
import { getImage, getRelated, getSimilar, recordView } from "@/lib/repo/images";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = getImage(id);
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("view") === "1") {
    const viewer = request.headers.get("x-viewer-id") || "anonymous";
    recordView(id, viewer);
    image.views += 1;
  }
  const related = getRelated(id, 12);
  const similar = getSimilar(id, 18);
  return NextResponse.json({ image, related, similar });
}
