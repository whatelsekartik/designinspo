import { DiscoverExperience } from "@/components/DiscoverExperience";
import { getAestheticCloud, getCategories, getFeed, getPublicStats } from "@/lib/repo/images";
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
    />
  );
}
