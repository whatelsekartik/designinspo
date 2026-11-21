import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/repo/settings";
import { providerStatus } from "@/lib/agent/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const images = db.prepare("SELECT COUNT(*) AS n FROM images WHERE status='published'").get() as { n: number };
  const cats = db.prepare("SELECT COUNT(*) AS n FROM categories WHERE image_count > 0").get() as { n: number };
  const saved = db.prepare("SELECT COUNT(*) AS n FROM collection_items").get() as { n: number };
  const collections = db.prepare("SELECT COUNT(*) AS n FROM collections").get() as { n: number };
  const today = db.prepare("SELECT COUNT(*) AS n FROM images WHERE published_at >= date('now')").get() as { n: number };
  const provider = providerStatus();
  const settings = getSettings();
  return NextResponse.json(
    {
      images: images.n,
      categories: cats.n,
      saved: saved.n,
      collections: collections.n,
      today: today.n,
      agent: {
        configured: provider.configured,
        running: settings.running,
        provider: provider.label,
        model: provider.model,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
