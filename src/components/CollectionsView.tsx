"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Bookmark, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Collection } from "@/lib/types";
import { api, cx } from "@/lib/client";
import { useToast } from "./ToastProvider";

const SUGGESTIONS = [
  { name: "Website Inspiration", description: "Heroes, layouts and editorial web systems." },
  { name: "Dashboard Ideas", description: "Data-dense interfaces with a point of view." },
  { name: "Minimalist Architecture", description: "Concrete, light and restraint." },
  { name: "Poster References", description: "Typographic force on paper." },
  { name: "Startup Branding", description: "Identity systems worth stealing from." },
  { name: "Random Creative Ideas", description: "Everything that made me stop scrolling." },
];

export function CollectionsView({ initial }: { initial: Collection[] }) {
  const [collections, setCollections] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const toast = useToast();
  const router = useRouter();

  const refresh = async () => {
    const res = await api<{ collections: Collection[] }>("/api/collections");
    setCollections(res.collections);
    router.refresh();
  };

  const create = async (n = name, d = description) => {
    if (!n.trim()) return;
    setBusy(true);
    try {
      await api("/api/collections", { method: "POST", body: JSON.stringify({ name: n, description: d }) });
      setName("");
      setDescription("");
      setCreating(false);
      await refresh();
      toast.push(`Created “${n}”`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not create collection", "error");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    if (!editName.trim()) return setEditing(null);
    try {
      await api(`/api/collections/${id}`, { method: "PATCH", body: JSON.stringify({ name: editName }) });
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not rename", "error");
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete “${label}”? The images stay in the library — only the collection is removed.`)) return;
    try {
      await api(`/api/collections/${id}`, { method: "DELETE" });
      await refresh();
      toast.push("Collection deleted");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not delete", "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1560px] px-4 pb-24 pt-[96px] md:px-8 md:pt-[112px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Bookmark size={11} className="text-ember" /> Your library
          </p>
          <h1 className="display mt-4 text-[clamp(34px,4.6vw,62px)] text-paper">
            Collections of <em>obsessions</em>.
          </h1>
          <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-paper/50">
            Group the images you keep coming back to. Everything you save is stored locally and survives restarts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
          <Plus size={13} /> New collection
        </button>
      </div>

      {(creating || collections.length === 0) && (
        <div className="panel fade-up mt-7 p-5">
          <p className="serif text-[19px] text-paper">Name a new collection</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
            <input className="field" placeholder="e.g. Website Inspiration" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="field" placeholder="Optional note" value={description} onChange={(e) => setDescription(e.target.value)} />
            <button className="btn btn-primary" onClick={() => create()} disabled={busy || !name.trim()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="label mr-1 self-center !text-[9px]">Start from</span>
            {SUGGESTIONS.filter((s) => !collections.some((c) => c.name === s.name)).map((s) => (
              <button key={s.name} className="chip !h-7 !text-[11px]" onClick={() => create(s.name, s.description)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((c) => (
          <div key={c.id} className="group panel overflow-hidden transition-colors hover:border-white/20">
            <Link href={`/collections/${c.id}`} className="block">
              <div className="grid h-[150px] grid-cols-4 gap-[2px] bg-ink-3">
                {c.preview && c.preview.length > 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="relative overflow-hidden bg-[#161210]">
                      {c.preview?.[i] ? (
                        <img
                          src={`/media/${c.preview[i]}`}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover opacity-90 transition duration-700 group-hover:opacity-100"
                        />
                      ) : (
                        <div className="h-full w-full" style={{ background: i % 2 ? "rgba(246,240,231,0.03)" : "transparent" }} />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-4 flex h-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${c.accent}22, transparent)` }}>
                    <span className="serif text-[13px] italic text-paper/30">No images yet</span>
                  </div>
                )}
              </div>
            </Link>
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                {editing === c.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && rename(c.id)}
                      className="field !h-8 !py-1 !text-[12.5px]"
                    />
                    <button className="icon-btn !h-7 !w-7" onClick={() => rename(c.id)}>
                      <Check size={12} />
                    </button>
                    <button className="icon-btn !h-7 !w-7" onClick={() => setEditing(null)}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <Link href={`/collections/${c.id}`} className="block">
                    <p className="serif truncate text-[18px] leading-tight text-paper">{c.name}</p>
                    <p className="mt-1 line-clamp-1 text-[11.5px] text-muted">{c.description || "No description"}</p>
                  </Link>
                )}
                <p className="mono mt-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-white/30">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} />
                  {c.item_count ?? 0} images
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="icon-btn !h-7 !w-7 opacity-0 transition group-hover:opacity-100"
                  onClick={() => {
                    setEditing(c.id);
                    setEditName(c.name);
                  }}
                  title="Rename"
                >
                  <Pencil size={11} />
                </button>
                <button
                  className={cx("icon-btn !h-7 !w-7 opacity-0 transition group-hover:opacity-100")}
                  onClick={() => remove(c.id, c.name)}
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
                <Link href={`/collections/${c.id}`} className="icon-btn !h-7 !w-7">
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {collections.length === 0 && (
        <p className="mt-10 text-center text-[12.5px] text-muted">
          Nothing saved yet — hover any image in the <Link href="/" className="text-ember underline-offset-4 hover:underline">discovery feed</Link> and hit the
          bookmark.
        </p>
      )}
    </div>
  );
}
