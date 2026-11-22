import { NextResponse } from "next/server";
import fs from "node:fs";
import { mediaFilePath } from "@/lib/repo/images";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join("/");
  const file = mediaFilePath(key);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const data = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(data.length),
    },
  });
}
