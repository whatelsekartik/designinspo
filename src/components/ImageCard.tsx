"use client";

import { useState } from "react";
import { Bookmark, Maximize2, Sparkles } from "lucide-react";
import type { FeedImage } from "@/lib/types";
import { api, cx } from "@/lib/client";
import { useToast } from "./ToastProvider";

interface Props {
  image: FeedImage;
  onOpen: (image: FeedImage) => void;
  onRemove?: (id: string) => void;
  priority?: boolean;
  showRemove?: boolean;
}

export function ImageCard({ image, onOpen, onRemove, priority, showRemove }: Props) {
  const [saved, setSaved] = useState(image.saved);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const toggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const res = await api<{ saved: boolean }>("/api/save", {
        method: "POST",
        body: JSON.stringify({ imageId: image.id }),
      });
      setSaved(res.saved);
      toast.push(res.saved ? `Saved “${image.title}”` : `Removed “${image.title}” from saved`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(image.id);
  };

  return (
    <article className="masonry-item">
      <div
        className="card"
        onClick={() => onOpen(image)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(image);
        }}
        style={{ aspectRatio: `${image.width || 4} / ${image.height || 5}`, background: image.avgColor }}
        aria-label={`Open ${image.title}`}
      >
        <img
          src={image.urls.medium}
          srcSet={`${image.urls.thumb} 512w, ${image.urls.medium} 960w, ${image.urls.full} 1600w`}
          sizes="(max-width: 900px) 48vw, (max-width: 1280px) 32vw, 22vw"
          alt={image.title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cx("absolute inset-0 h-full w-full", loaded ? "opacity-100" : "opacity-0")}
        />
        {!loaded && (
          <div
            className="absolute inset-0 blur-lg"
            style={{
              backgroundImage: image.blurData ? `url(${image.blurData})` : undefined,
              backgroundSize: "cover",
              backgroundColor: image.avgColor,
              opacity: 0.55,
            }}
          />
        )}

        <div className="card-actions">
          {showRemove && (
            <button className="icon-btn" onClick={remove} aria-label="Remove from collection" title="Remove">
              <span className="text-[13px] leading-none">×</span>
            </button>
          )}
          <button
            className="icon-btn"
            data-saved={saved}
            onClick={toggleSave}
            aria-label={saved ? "Remove from saved" : "Save image"}
            title={saved ? "Saved" : "Save"}
          >
            <Bookmark size={13} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="card-meta">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="serif truncate text-[14px] leading-tight text-paper">{image.title}</p>
              <p className="mono mt-1.5 flex items-center gap-1.5 truncate text-[9.5px] uppercase tracking-[0.14em] text-paper/55">
                <Sparkles size={9} className="text-ember" />
                AI · {image.categoryLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {image.palette.slice(0, 3).map((c) => (
                <span key={c} className="h-2 w-2 rounded-full ring-1 ring-black/40" style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute left-2.5 top-2.5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <span className="viewer-hint pointer-events-none absolute right-2.5 bottom-2.5 hidden opacity-0">
          <Maximize2 size={12} />
        </span>
      </div>
    </article>
  );
}

export function CardSkeleton({ height }: { height: number }) {
  return (
    <div className="masonry-item">
      <div className="skeleton w-full" style={{ height }} />
    </div>
  );
}
