"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedImage } from "@/lib/types";
import { api } from "@/lib/client";
import { ImageCard, CardSkeleton } from "./ImageCard";

export interface FeedParams {
  sort?: string;
  category?: string;
  q?: string;
  aesthetic?: string;
  saved?: boolean;
  collection?: string;
  seed?: number;
}

interface Props {
  params: FeedParams;
  onOpen: (image: FeedImage, list: FeedImage[]) => void;
  emptyState?: React.ReactNode;
  showRemove?: boolean;
  onRemove?: (id: string) => void;
  pageSize?: number;
  initial?: FeedImage[];
  resetKey?: string | number;
}

const SKELETONS = [260, 340, 210, 300, 240, 380, 280, 220, 320, 260, 400, 230];

export function MasonryFeed({ params, onOpen, emptyState, showRemove, onRemove, pageSize = 28, initial, resetKey }: Props) {
  const [images, setImages] = useState<FeedImage[]>(initial ?? []);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const imagesRef = useRef<FeedImage[]>([]);
  imagesRef.current = images;

  const buildUrl = useCallback(
    (p: number) => {
      const sp = new URLSearchParams();
      sp.set("page", String(p));
      sp.set("limit", String(pageSize));
      if (params.sort) sp.set("sort", params.sort);
      if (params.category && params.category !== "all") sp.set("category", params.category);
      if (params.q) sp.set("q", params.q);
      if (params.aesthetic) sp.set("aesthetic", params.aesthetic);
      if (params.saved) sp.set("saved", "1");
      if (params.collection) sp.set("collection", params.collection);
      if (params.seed) sp.set("seed", String(params.seed));
      return `/api/feed?${sp.toString()}`;
    },
    [params.sort, params.category, params.q, params.aesthetic, params.saved, params.collection, params.seed, pageSize],
  );

  // Reset whenever the query parameters change.
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setImages([]);
    setPage(0);
    setHasMore(true);
    api<{ images: FeedImage[]; hasMore: boolean; total: number }>(buildUrl(0))
      .then((data) => {
        if (id !== requestId.current) return;
        setImages(data.images);
        setHasMore(data.hasMore);
      })
      .catch((err) => id === requestId.current && setError(err instanceof Error ? err.message : "Feed unavailable"))
      .finally(() => id === requestId.current && setLoading(false));
  }, [buildUrl, resetKey]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    api<{ images: FeedImage[]; hasMore: boolean }>(buildUrl(next))
      .then((data) => {
        setImages((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...data.images.filter((i) => !seen.has(i.id))];
        });
        setHasMore(data.hasMore);
        setPage(next);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [buildUrl, hasMore, loading, loadingMore, page]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading]);

  if (error) {
    return (
      <div className="panel mx-auto max-w-md px-6 py-8 text-center">
        <p className="serif text-[20px] text-paper">The feed is quiet</p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{error}</p>
        <button className="btn mt-5" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="masonry" aria-busy="true">
        {SKELETONS.map((h, i) => (
          <CardSkeleton key={i} height={h} />
        ))}
      </div>
    );
  }

  if (!images.length) {
    return <>{emptyState ?? <p className="py-16 text-center text-[13px] text-muted">Nothing here yet.</p>}</>;
  }

  return (
    <>
      <div className="masonry">
        {images.map((image, i) => (
          <ImageCard
            key={image.id}
            image={image}
            priority={i < 6}
            showRemove={showRemove}
            onRemove={onRemove}
            onOpen={(img) => onOpen(img, imagesRef.current)}
          />
        ))}
        {loadingMore && SKELETONS.slice(0, 6).map((h, i) => <CardSkeleton key={`m-${i}`} height={h} />)}
      </div>
      <div ref={sentinel} className="h-10" />
      {!hasMore && (
        <p className="mono py-10 text-center text-[10px] uppercase tracking-[0.22em] text-white/25">
          End of this thread — the agent keeps weaving new ones
        </p>
      )}
    </>
  );
}
