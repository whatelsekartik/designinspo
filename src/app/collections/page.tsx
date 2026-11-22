import { CollectionsView } from "@/components/CollectionsView";
import { listCollections } from "@/lib/repo/collections";

export const dynamic = "force-dynamic";

export const metadata = { title: "Collections — INFINITE" };

export default function CollectionsPage() {
  return <CollectionsView initial={listCollections()} />;
}
