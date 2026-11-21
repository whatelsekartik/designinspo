import { NextResponse } from "next/server";
import { exportManifest } from "@/lib/agent/pipeline";
import { logEvent } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

/**
 * When no generation provider is configured the agent can still do its job:
 * it writes a manifest of fully-composed prompts that any external image studio
 * (including a human-guided AI agent) can fulfil. Ingest the results with
 * `npm run ingest -- --manifest <file> --dir <directory-of-images>`.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { count?: number; direction?: string };
  const count = Math.max(1, Math.min(Number(body.count) || 12, 200));
  const manifest = await exportManifest(count, body.direction);
  logEvent("queue", `Exported ${manifest.prompts.length} fully-composed prompts as an external generation manifest.`, {
    meta: { file: manifest.file },
  });
  return NextResponse.json({
    file: manifest.file.split("/storage/").pop(),
    prompts: manifest.prompts.map((p) => ({ prompt: p.prompt, aspect: p.aspect })),
  });
}
