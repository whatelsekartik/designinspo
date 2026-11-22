import { NextResponse } from "next/server";
import { getFeed, type SortKey } from "@/lib/repo/images";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sort = (url.searchParams.get("sort") || "newest") as SortKey;
  try {
    const result = getFeed({
      page: Number(url.searchParams.get("page") || 0),
      limit: Number(url.searchParams.get("limit") || 30),
      sort: ["newest", "trending", "random", "for-you"].includes(sort) ? sort : "newest",
      category: url.searchParams.get("category") || undefined,
      aesthetic: url.searchParams.get("aesthetic") || undefined,
      q: url.searchParams.get("q") || undefined,
      seed: url.searchParams.get("seed") ? Number(url.searchParams.get("seed")) : undefined,
      savedOnly: url.searchParams.get("saved") === "1",
      collectionId: url.searchParams.get("collection") || undefined,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feed failed" }, { status: 500 });
  }
}
