import { NextResponse } from "next/server";
import { getAestheticCloud, getCategories } from "@/lib/repo/images";
import { listCollections } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    categories: getCategories(),
    aesthetics: getAestheticCloud(30),
    collections: listCollections(),
  });
}
