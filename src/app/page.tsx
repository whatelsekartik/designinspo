import { DiscoverExperience } from "@/components/DiscoverExperience";
import { getAestheticCloud, getCategories, getFeed, getPublicStats } from "@/lib/repo/images";
import { listEvents } from "@/lib/repo/settings";
import { ensureRuntime } from "@/lib/agent/runtime";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ category?: string; sort?: string }> }) {
  const { category, sort } = await searchParams;
  ensureRuntime();
  const feed = getFeed({ sort: "newest", limit: 28 });
  const categories = getCategories();
  const aesthetics = getAestheticCloud(24);
  const publicStats = getPublicStats();

  return (
    <DiscoverExperience
      initialImages={feed.images}
      categories={categories}
      aesthetics={aesthetics}
      stats={{ images: publicStats.images, categories: publicStats.categories, today: publicStats.today }}
      initialCategory={category}
      initialSort={sort}
      initialEvents={listEvents(12).map((e) => ({ id: e.id, kind: e.kind, message: e.message, created_at: e.created_at }))}
    />
  );
}
