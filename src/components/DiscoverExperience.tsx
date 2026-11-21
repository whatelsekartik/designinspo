"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Shuffle, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Category, FeedImage } from "@/lib/types";
import { api, cx, formatCount, timeAgo } from "@/lib/client";
import { MasonryFeed } from "./MasonryFeed";
import { ImageViewer } from "./ImageViewer";

interface Props {
  initialImages: FeedImage[];
  categories: Category[];
  aesthetics: { aesthetic: string; count: number }[];
  stats: { images: number; categories: number; today: number };
  initialCategory?: string;
  initialSort?: string;
}

type Sort = "newest" | "trending" | "for-you" | "random";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Fresh" },
  { id: "trending", label: "Trending" },
  { id: "for-you", label: "For you" },
  { id: "random", label: "Shuffle" },
];

interface AgentEventLine {
  id: string;
  kind: string;
  message: string;
  created_at: string;
}

export function DiscoverExperience({ initialImages, categories, aesthetics, stats, initialCategory, initialSort }: Props) {
  const [sort, setSort] = useState<Sort>((SORTS.find((s) => s.id === initialSort)?.id ?? "newest") as Sort);
  const [category, setCategory] = useState(initialCategory && categories.some((c) => c.id === initialCategory) ? initialCategory : "all");
  const [aesthetic, setAesthetic] = useState("");
  const [seed, setSeed] = useState(1);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; list: FeedImage[] } | null>(null);
  const [events, setEvents] = useState<AgentEventLine[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<{ events: AgentEventLine[] }>("/api/studio/events?limit=12")
      .then((d) => setEvents(d.events))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (events.length < 2) return;
    const t = setInterval(() => setTick((t) => t + 1), 6500);
    return () => clearInterval(t);
  }, [events.length]);

  const openViewer = useCallback((image: FeedImage, list: FeedImage[]) => {
    setViewer({ id: image.id, list });
    window.history.pushState({ viewer: image.id }, "", `/image/${image.id}`);
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
    if (window.history.state?.viewer) window.history.back();
    else window.history.replaceState(null, "", "/");
  }, []);

  const navigateViewer = useCallback((id: string) => {
    setViewer((v) => (v ? { ...v, id } : v));
    window.history.replaceState({ viewer: id }, "", `/image/${id}`);
  }, []);

  useEffect(() => {
    const onPop = () => setViewer(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (category !== "all") sp.set("category", category);
    if (sort !== "newest") sp.set("sort", sort);
    const qs = sp.toString();
    window.history.replaceState({ ...(window.history.state ?? {}) }, "", qs ? `/?${qs}` : "/");
  }, [category, sort]);

  const activeCategories = useMemo(() => categories.filter((c) => c.image_count > 0), [categories]);
  const visibleCategories = showAllCategories ? activeCategories : activeCategories.slice(0, 12);
  const params = useMemo(
    () => ({ sort, category: category === "all" ? undefined : category, aesthetic: aesthetic || undefined, seed }),
    [sort, category, aesthetic, seed],
  );
  const currentEvent = events.length ? events[tick % events.length] : null;

  return (
    <div className="relative z-10">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1840px] px-4 pb-8 pt-[104px] md:px-7 md:pt-[132px]">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot" />
          <span className="eyebrow">A self-generating visual archive</span>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.45fr_1fr] lg:items-end">
          <h1 className="display text-[clamp(42px,6.4vw,92px)] text-paper">
            An infinite atlas
            <br />
            of <em>visual ideas</em>.
          </h1>
          <div className="max-w-[440px] lg:pb-2">
            <p className="text-[13.5px] leading-relaxed text-paper/55">
              Every image below was imagined, generated and catalogued by an autonomous agent. It studies its own coverage, invents new
              directions, rejects its own near-duplicates, and keeps publishing.
            </p>
            <div className="mono mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] uppercase tracking-[0.16em] text-paper/45">
              <span className="text-paper/80">{formatCount(stats.images)} images</span>
              <span className="h-2.5 w-px bg-white/15" />
              <span>{stats.categories} directions</span>
              <span className="h-2.5 w-px bg-white/15" />
              <span className="text-ember/80">+{stats.today} today</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link href="/studio" className="btn btn-primary">
                <Sparkles size={13} /> Enter the AI Studio
              </Link>
              <Link href="/search" className="btn">
                Search the library <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* live agent line */}
        <div className="mt-9 flex items-center gap-3 overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
          <span className="mono flex shrink-0 items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-ember/90">
            <span className="pulse-dot" /> Agent live
          </span>
          <div className="relative h-4 flex-1 overflow-hidden">
            {currentEvent ? (
              <p key={currentEvent.id + tick} className="fade-in absolute inset-0 truncate text-[11.5px] text-paper/55">
                {currentEvent.message}
                <span className="mono ml-2 text-[9.5px] uppercase tracking-[0.15em] text-paper/25">{timeAgo(currentEvent.created_at)}</span>
              </p>
            ) : (
              <p className="text-[11.5px] text-paper/40">Agent activity will appear here.</p>
            )}
          </div>
          <Link href="/studio" className="mono hidden shrink-0 text-[9.5px] uppercase tracking-[0.18em] text-paper/35 hover:text-paper sm:block">
            Studio →
          </Link>
        </div>
      </section>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="sticky top-[63px] z-30 border-y border-white/[0.06] bg-[rgba(10,8,7,0.82)] backdrop-blur-xl">
        <div className="mx-auto max-w-[1840px] px-4 md:px-7">
          <div className="flex items-center gap-3 py-2.5">
            <div className="no-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto">
              <button className="chip shrink-0" data-active={category === "all"} onClick={() => setCategory("all")}>
                Everything
                <span className="count">{formatCount(stats.images)}</span>
              </button>
              {visibleCategories.map((c) => (
                <button key={c.id} className="chip shrink-0" data-active={category === c.id} onClick={() => setCategory(c.id)}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} />
                  {c.label}
                  <span className="count">{c.image_count}</span>
                </button>
              ))}
              {activeCategories.length > 12 && (
                <button className="chip shrink-0" onClick={() => setShowAllCategories((s) => !s)}>
                  {showAllCategories ? "Less" : `+${activeCategories.length - 12} more`}
                </button>
              )}
            </div>

            <div className="hidden shrink-0 items-center gap-1 rounded-full border border-white/[0.08] p-0.5 md:flex">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSort(s.id);
                    if (s.id === "random") setSeed(Math.floor(Math.random() * 100000));
                  }}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[11.5px] transition-colors",
                    sort === s.id ? "bg-paper text-[#170f0a]" : "text-paper/50 hover:text-paper/85",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button className="icon-btn shrink-0 md:hidden" onClick={() => setShowFilters((s) => !s)} aria-label="Filters">
              <SlidersHorizontal size={14} />
            </button>
          </div>

          {(showFilters || aesthetic) && (
            <div className="flex flex-wrap items-center gap-2 pb-3 md:hidden">
              {SORTS.map((s) => (
                <button key={s.id} className="chip" data-active={sort === s.id} onClick={() => setSort(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] py-2">
            <span className="label mr-1 !text-[9px]">Aesthetics</span>
            <button className="chip shrink-0 !h-6 !px-2.5 !text-[10.5px]" data-active={!aesthetic} onClick={() => setAesthetic("")}>
              Any
            </button>
            {aesthetics.slice(0, 10).map((a) => (
              <button
                key={a.aesthetic}
                className="chip shrink-0 !h-6 !px-2.5 !text-[10.5px]"
                data-active={aesthetic === a.aesthetic}
                onClick={() => setAesthetic(aesthetic === a.aesthetic ? "" : a.aesthetic)}
              >
                {a.aesthetic}
              </button>
            ))}
            {sort === "random" && (
              <button className="ml-auto flex items-center gap-1.5 text-[11px] text-paper/50 hover:text-paper" onClick={() => setSeed(Math.floor(Math.random() * 100000))}>
                <Shuffle size={12} /> Reshuffle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1840px] px-4 pb-24 pt-5 md:px-7">
        {category !== "all" && (
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="serif text-[22px] text-paper">
              {categories.find((c) => c.id === category)?.label}
              <span className="mono ml-3 text-[10px] uppercase tracking-[0.16em] text-muted">
                {categories.find((c) => c.id === category)?.description}
              </span>
            </h2>
          </div>
        )}
        <MasonryFeed
          params={params}
          initial={category === "all" && sort === "newest" ? initialImages : undefined}
          resetKey={`${sort}-${category}-${aesthetic}-${seed}`}
          onOpen={openViewer}
          emptyState={
            <div className="panel mx-auto max-w-lg px-7 py-10 text-center">
              <p className="serif text-[24px] text-paper">This thread is empty</p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
                The agent hasn&apos;t generated anything in this direction yet. Open the studio to point it somewhere new.
              </p>
              <Link href="/studio" className="btn btn-primary mt-5">
                Direct the agent
              </Link>
            </div>
          }
        />
      </section>

      <section className="mx-auto max-w-[1840px] px-4 pb-8 md:px-7">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[rgba(228,121,74,0.10)] via-[rgba(30,24,19,0.5)] to-transparent p-6 md:p-10">
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <p className="eyebrow flex items-center gap-2">
                <span className="pulse-dot" /> The library is still being written
              </p>
              <h2 className="display mt-4 text-[clamp(26px,3.4vw,44px)] text-paper">
                Commission the <em>next direction</em>.
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/50">
                Hand the agent a brief — “warm brutalist interiors with sea light”, “editorial layouts for a type foundry” — and it will turn
                the idea into prompts, images and new categories.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/studio" className="btn btn-primary">
                <Sparkles size={13} /> Direct the agent
              </Link>
              <Link href="/setup" className="btn">
                Connect a provider <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        </div>
      </section>

      {viewer && <ImageViewer imageId={viewer.id} list={viewer.list} onClose={closeViewer} onNavigate={navigateViewer} />}
    </div>
  );
}
