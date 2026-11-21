"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search, X } from "lucide-react";
import { api } from "@/lib/client";
import type { FeedImage } from "@/lib/types";
import { TRENDING_SEARCHES } from "@/lib/taxonomy";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FeedImage[]>([]);
  const [aesthetics, setAesthetics] = useState<{ aesthetic: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api<{ aesthetics: { aesthetic: string; count: number }[] }>("/api/categories")
      .then((d) => setAesthetics(d.aesthetics.slice(0, 8)))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api<{ images: FeedImage[] }>(`/api/feed?q=${encodeURIComponent(q)}&limit=8`)
        .then((d) => setResults(d.images))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 260);
    return () => clearTimeout(timer);
  }, [q]);

  if (!open) return null;

  const submit = (value: string) => {
    if (!value.trim()) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(value.trim())}`);
  };

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative mx-auto mt-[10vh] w-[min(92vw,820px)]">
        <div className="panel overflow-hidden shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <Search size={17} className="text-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(q);
              }}
              placeholder="Search concepts, aesthetics, materials, moods…"
              className="flex-1 bg-transparent text-[15px] text-paper outline-none placeholder:text-white/25"
            />
            <button onClick={onClose} className="icon-btn" aria-label="Close search">
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[56vh] overflow-y-auto px-5 py-4">
            {!q && (
              <div className="space-y-5">
                <div>
                  <p className="label mb-3">Trending searches</p>
                  <div className="flex flex-wrap gap-2">
                    {TRENDING_SEARCHES.slice(0, 6).map((t) => (
                      <button key={t} className="chip" onClick={() => setQ(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {aesthetics.length > 0 && (
                  <div>
                    <p className="label mb-3">Aesthetics in the library</p>
                    <div className="flex flex-wrap gap-2">
                      {aesthetics.map((a) => (
                        <Link key={a.aesthetic} href={`/search?aesthetic=${encodeURIComponent(a.aesthetic)}`} onClick={onClose} className="chip">
                          {a.aesthetic} <span className="count">{a.count}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {q && (
              <div>
                {loading && <p className="label py-2">Searching the library…</p>}
                {!loading && results.length === 0 && (
                  <p className="py-4 text-[13px] text-muted">
                    No matches for “{q}”. Try an aesthetic, a material, or a mood — e.g. “warm brutalist concrete”.
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {results.map((img) => (
                    <Link
                      key={img.id}
                      href={`/image/${img.id}`}
                      onClick={onClose}
                      className="group relative block aspect-square overflow-hidden rounded-lg bg-ink-3"
                    >
                      <img src={img.urls.thumb} alt={img.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1.5 pt-4 text-[10px] text-paper/90">
                        {img.title}
                      </span>
                    </Link>
                  ))}
                </div>
                {results.length > 0 && (
                  <button onClick={() => submit(q)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-[12.5px] text-paper hover:bg-white/5">
                    <span>See all results for “{q}”</span>
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="mono mt-3 text-center text-[10px] tracking-[0.18em] text-white/30">ESC TO CLOSE · ENTER TO EXPLORE</p>
      </div>
    </div>
  );
}
