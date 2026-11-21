"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import type { FeedImage } from "@/lib/types";
import { api, cx } from "@/lib/client";
import { MasonryFeed } from "./MasonryFeed";
import { ImageViewer } from "./ImageViewer";
import { TRENDING_SEARCHES } from "@/lib/taxonomy";

interface Props {
  initialQuery: string;
  initialAesthetic: string;
  aesthetics: { aesthetic: string; count: number }[];
  total: number;
}

export function SearchExperience({ initialQuery, initialAesthetic, aesthetics, total }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [aesthetic, setAesthetic] = useState(initialAesthetic);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [count, setCount] = useState(total);
  const [viewer, setViewer] = useState<{ id: string; list: FeedImage[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!initialQuery && !initialAesthetic) inputRef.current?.focus();
  }, [initialQuery, initialAesthetic]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (submitted) sp.set("q", submitted);
    if (aesthetic) sp.set("aesthetic", aesthetic);
    const qs = sp.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [submitted, aesthetic, router]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("limit", "1");
    if (submitted) params.set("q", submitted);
    if (aesthetic) params.set("aesthetic", aesthetic);
    api<{ total: number }>(`/api/feed?${params.toString()}`)
      .then((d) => setCount(d.total))
      .catch(() => {});
  }, [submitted, aesthetic]);

  const params = useMemo(
    () => ({ q: submitted || undefined, aesthetic: aesthetic || undefined, sort: submitted ? "trending" : "newest" }),
    [submitted, aesthetic],
  );

  const active = submitted || aesthetic;

  return (
    <div className="mx-auto max-w-[1840px] px-4 pb-24 pt-[96px] md:px-7 md:pt-[112px]">
      <p className="eyebrow flex items-center gap-2">
        <Search size={11} /> Search the universe
      </p>
      <h1 className="display mt-4 max-w-3xl text-[clamp(30px,4.4vw,60px)] text-paper">
        {submitted ? (
          <>
            Results for <em>“{submitted}”</em>
          </>
        ) : aesthetic ? (
          <>
            The <em>{aesthetic}</em> aesthetic
          </>
        ) : (
          <>
            Look for a feeling, <em>not a filename</em>.
          </>
        )}
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
        className="mt-6 flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setSubmitted("");
            }}
            placeholder="Minimal dark dashboard with glassmorphism…"
            className="field !h-12 !rounded-full !pl-11 !pr-10 !text-[14px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSubmitted("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-paper"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button className="btn btn-primary !h-12 !px-6">Search</button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="label mr-1 !text-[9px]">Aesthetic</span>
        <button className="chip !h-7 !text-[11px]" data-active={!aesthetic} onClick={() => setAesthetic("")}>
          Any
        </button>
        {aesthetics.slice(0, 12).map((a) => (
          <button
            key={a.aesthetic}
            className="chip !h-7 !text-[11px]"
            data-active={aesthetic === a.aesthetic}
            onClick={() => setAesthetic(aesthetic === a.aesthetic ? "" : a.aesthetic)}
          >
            {a.aesthetic} <span className="count">{a.count}</span>
          </button>
        ))}
      </div>

      {!active && (
        <div className="mt-8">
          <p className="label mb-3">Try one of these</p>
          <div className="flex flex-wrap gap-2">
            {TRENDING_SEARCHES.map((t) => (
              <button
                key={t}
                className="chip"
                onClick={() => {
                  setQuery(t);
                  setSubmitted(t);
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-baseline justify-between border-b border-white/[0.07] pb-3">
        <p className="label">{active ? `${count} matching images` : "Everything in the library"}</p>
        <Link href="/" className="mono flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-paper/35 hover:text-paper">
          <Sparkles size={10} /> Browse instead
        </Link>
      </div>

      <div className="mt-5">
        <MasonryFeed
          params={params}
          resetKey={`${submitted}-${aesthetic}`}
          onOpen={(image, list) => setViewer({ id: image.id, list })}
          emptyState={
            <div className="panel mx-auto max-w-lg px-7 py-10 text-center">
              <p className="serif text-[24px] text-paper">No image matches yet</p>
              <p className={cx("mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted")}>
                The agent may not have explored this corner of the universe. Try a broader word, another aesthetic, or ask the studio to generate it.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Link href="/studio" className="btn btn-primary">
                  Direct the agent
                </Link>
                <button className="btn" onClick={() => { setSubmitted(""); setAesthetic(""); setQuery(""); }}>
                  Clear
                </button>
              </div>
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
