"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import type { Collection, FeedImage } from "@/lib/types";
import { api } from "@/lib/client";
import { MasonryFeed } from "./MasonryFeed";
import { ImageViewer } from "./ImageViewer";
import { useToast } from "./ToastProvider";

export function CollectionDetail({ collection, initialImages }: { collection: Collection; initialImages: FeedImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description);
  const [viewer, setViewer] = useState<{ id: string; list: FeedImage[] } | null>(null);
  const toast = useToast();
  const router = useRouter();

  const save = async () => {
    try {
      await api(`/api/collections/${collection.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      });
      setEditing(false);
      toast.push("Collection updated", "success");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not update", "error");
    }
  };

  const remove = async (imageId: string) => {
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    try {
      await api(`/api/collections/${collection.id}/items?imageId=${imageId}`, { method: "DELETE" });
      toast.push("Removed from collection");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not remove", "error");
    }
  };

  const destroy = async () => {
    if (!confirm(`Delete “${collection.name}”?`)) return;
    try {
      await api(`/api/collections/${collection.id}`, { method: "DELETE" });
      router.push("/collections");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not delete", "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1840px] px-4 pb-24 pt-[96px] md:px-7 md:pt-[112px]">
      <Link href="/collections" className="mono inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-paper/40 hover:text-paper">
        <ArrowLeft size={12} /> All collections
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-6">
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className="field serif !text-[26px]" />
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="field !text-[12.5px]" placeholder="Description" />
              <div className="flex gap-2">
                <button className="btn btn-primary !h-8" onClick={save}>
                  <Check size={12} /> Save
                </button>
                <button className="btn !h-8" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow">Collection</p>
              <h1 className="display mt-3 text-[clamp(30px,4.2vw,56px)] text-paper">{collection.name}</h1>
              {collection.description && <p className="mt-2 max-w-xl text-[13px] text-paper/50">{collection.description}</p>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="mono mr-2 text-[10px] uppercase tracking-[0.14em] text-white/30">{images.length} images</span>
          <button className="btn !h-8" onClick={() => setEditing((e) => !e)}>
            <Pencil size={12} /> Rename
          </button>
          <button className="btn !h-8" onClick={destroy}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div className="mt-6">
        <MasonryFeed
          params={{ collection: collection.id, sort: "newest" }}
          initial={images}
          showRemove
          onRemove={remove}
          onOpen={(image, list) => setViewer({ id: image.id, list })}
          emptyState={
            <div className="panel mx-auto max-w-md px-6 py-10 text-center">
              <p className="serif text-[22px] text-paper">An empty frame</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                Save images here from the discovery feed to build this collection.
              </p>
              <Link href="/" className="btn btn-primary mt-5">
                Find something
              </Link>
            </div>
          }
        />
      </div>

      {viewer && (
        <ImageViewer
          imageId={viewer.id}
          list={viewer.list}
          onClose={() => setViewer(null)}
          onNavigate={(id) => setViewer((v) => (v ? { ...v, id } : v))}
        />
      )}
    </div>
  );
}
