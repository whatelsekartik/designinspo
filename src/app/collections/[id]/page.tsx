import { notFound } from "next/navigation";
import { CollectionDetail } from "@/components/CollectionDetail";
import { getCollection } from "@/lib/repo/collections";
import { getFeed } from "@/lib/repo/images";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = getCollection(id);
  if (!collection) notFound();
  const feed = getFeed({ collectionId: id, sort: "newest", limit: 28 });
  return <CollectionDetail collection={collection} initialImages={feed.images} />;
}
