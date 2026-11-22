import { SearchExperience } from "@/components/SearchExperience";
import { getAestheticCloud, getFeed } from "@/lib/repo/images";

export const dynamic = "force-dynamic";

export const metadata = { title: "Search — INFINITE" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; aesthetic?: string }> }) {
  const { q = "", aesthetic = "" } = await searchParams;
  const feed = getFeed({ q: q || undefined, aesthetic: aesthetic || undefined, sort: q ? "trending" : "newest", limit: 1 });
  return (
    <SearchExperience
      initialQuery={q}
      initialAesthetic={aesthetic}
      aesthetics={getAestheticCloud(30)}
      total={feed.total}
    />
  );
}
