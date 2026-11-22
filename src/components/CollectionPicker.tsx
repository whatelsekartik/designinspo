"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Loader2, X } from "lucide-react";
import { api, cx } from "@/lib/client";
import type { Collection } from "@/lib/types";
import { useToast } from "./ToastProvider";

interface Props {
  imageId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function CollectionPicker({ imageId, onClose, onSaved }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const load = async () => {
    const [{ collections }, detail] = await Promise.all([
      api<{ collections: Collection[] }>("/api/collections"),
      api<{ image: { collections: { id: string }[] } }>(`/api/images/${imageId}`),
    ]);
    setCollections(collections);
    setSelected(new Set(detail.image.collections.map((c) => c.id)));
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", onClick), 10);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (collection: Collection) => {
    setBusy(collection.id);
    const isIn = selected.has(collection.id);
    try {
      if (isIn) {
        await api(`/api/collections/${collection.id}/items?imageId=${imageId}`, { method: "DELETE" });
      } else {
        await api(`/api/collections/${collection.id}/items`, { method: "POST", body: JSON.stringify({ imageId }) });
      }
      const next = new Set(selected);
      if (isIn) next.delete(collection.id);
      else next.add(collection.id);
      setSelected(next);
      onSaved?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not update collection", "error");
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const { collection } = await api<{ collection: Collection }>("/api/collections", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      await api(`/api/collections/${collection.id}/items`, { method: "POST", body: JSON.stringify({ imageId }) });
      setCollections((c) => [{ ...collection, item_count: 1 }, ...c]);
      setSelected((s) => new Set(s).add(collection.id));
      setNewName("");
      setCreating(false);
      onSaved?.();
      toast.push(`Saved to “${collection.name}”`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not create collection", "error");
    }
  };

  return (
    <div
      ref={ref}
      className="glass fade-up absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] rounded-xl p-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
        <p className="label">Save to collection</p>
        <button onClick={onClose} className="text-muted hover:text-paper" aria-label="Close">
          <X size={13} />
        </button>
      </div>

      {loading && <p className="px-2 py-3 text-[12px] text-muted">Loading…</p>}

      <div className="max-h-[220px] overflow-y-auto">
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12.5px] text-paper/80 transition hover:bg-white/[0.06]"
          >
            <span
              className={cx("flex h-4 w-4 items-center justify-center rounded border", selected.has(c.id) ? "border-ember bg-ember text-[#1b0d06]" : "border-white/25")}
            >
              {busy === c.id ? <Loader2 size={9} className="animate-spin text-paper" /> : selected.has(c.id) ? <Check size={10} strokeWidth={3} /> : null}
            </span>
            <span className="flex-1 truncate">{c.name}</span>
            <span className="mono text-[10px] text-muted">{c.item_count ?? 0}</span>
          </button>
        ))}
      </div>

      {creating ? (
        <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 px-1 pt-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Collection name"
            className="field h-8 !py-1 !text-[12px]"
          />
          <button onClick={create} className="btn btn-primary h-8 !px-3 !text-[11px]">
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-white/10 px-2 py-2.5 text-[12px] text-paper/60 transition hover:bg-white/[0.05] hover:text-paper"
        >
          <FolderPlus size={12} /> New collection
        </button>
      )}
    </div>
  );
}
