import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/agent/providers";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const images = (db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number }).n;
  const provider = providerStatus();
  return NextResponse.json({
    ok: true,
    database: { driver: "local-sqlite", images },
    storage: { driver: process.env.STORAGE_DRIVER || "local" },
    provider: {
      configured: provider.configured,
      id: provider.id,
      model: provider.model,
      missing: provider.missing,
    },
    agent: { running: getSettings().running },
  });
}
