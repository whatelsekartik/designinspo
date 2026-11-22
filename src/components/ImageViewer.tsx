"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { FeedImage } from "@/lib/types";
import { api, cx, formatDate, viewerId } from "@/lib/client";
import { useToast } from "./ToastProvider";
import { CollectionPicker } from "./CollectionPicker";

export interface DetailPayload {
  image: FeedImage & { negativePrompt: string; seed: number | null; bytes: number; jobId: string | null; campaignId: string | null };
  related: FeedImage[];
  similar: FeedImage[];
}

interface Props {
  imageId: string;
  list?: FeedImage[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function ImageViewer({ imageId, list = [], onClose, onNavigate }: Props) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [variationState, setVariationState] = useState<"idle" | "busy" | "done">("idle");
  const [showPrompt, setShowPrompt] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setImageLoaded(false);
    setData(null);
    setPickerOpen(false);
    const controller = new AbortController();
    api<DetailPayload>(`/api/images/${imageId}?view=1`, { headers: { "x-viewer-id": viewerId() }, signal: controller.signal })
      .then((d) => {
        setData(d);
        setSaved(d.image.saved);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setLoading(false);
      });
    scrollRef.current?.scrollTo({ top: 0 });
    return () => controller.abort();
  }, [imageId]);

  const index = list.findIndex((i) => i.id === imageId);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      const target = dir === -1 ? prev : next;
      if (target) onNavigate(target.id);
    },
    [onNavigate, next, prev],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") navigate(1);
      if (e.key === "ArrowLeft") navigate(-1);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [navigate, onClose]);

  const toggleSave = async () => {
    try {
      const res = await api<{ saved: boolean }>("/api/save", { method: "POST", body: JSON.stringify({ imageId }) });
      setSaved(res.saved);
      toast.push(res.saved ? "Saved" : "Removed from saved", "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save", "error");
    }
  };

  const copyPrompt = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.image.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.push("Clipboard is unavailable in this browser", "error");
    }
  };

  const generateVariations = async () => {
    if (!data) return;
    setVariationState("busy");
    try {
      const res = await api<{ message: string }>(`/api/images/${imageId}/variations`, {
        method: "POST",
        body: JSON.stringify({ count: 6 }),
      });
      setVariationState("done");
      toast.push(res.message, "success");
    } catch (err) {
      setVariationState("idle");
      toast.push(err instanceof Error ? err.message : "Could not queue variations", "error");
    }
  };

  const image = data?.image;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#070504]/96 backdrop-blur-2xl fade-in" role="dialog" aria-modal="true" aria-label={image?.title ?? "Inspiration"}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-3 md:px-5">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="icon-btn" aria-label="Close viewer">
            <X size={15} />
          </button>
          <span className="mono hidden text-[10px] uppercase tracking-[0.2em] text-white/35 sm:block">
            {index >= 0 && list.length ? `${String(index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}` : "INSPIRATION"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {image && (
            <>
              <Link href={`/image/${image.id}`} className="btn btn-ghost h-9 !px-3 !text-[11.5px]" title="Open as page">
                <ArrowUpRight size={13} /> <span className="hidden sm:inline">Open page</span>
              </Link>
              <a href={image.urls.full} download={`${image.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.webp`} className="icon-btn" title="Download original">
                <Download size={14} />
              </a>
            </>
          )}
          <div className="ml-1 flex items-center gap-1 rounded-full border border-white/10 p-0.5">
            <button onClick={() => navigate(-1)} disabled={!prev} className="icon-btn !h-7 !w-7 disabled:opacity-25" aria-label="Previous">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => navigate(1)} disabled={!next} className="icon-btn !h-7 !w-7 disabled:opacity-25" aria-label="Next">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[42vh] flex-1 items-center justify-center overflow-hidden p-3 lg:min-h-0 lg:p-8">
          {loading || !image ? (
            <div className="skeleton h-full w-full max-w-3xl" />
          ) : (
            <>
              <img
                src={image.urls.full}
                alt={image.title}
                onLoad={() => setImageLoaded(true)}
                className={cx(
                  "max-h-full max-w-full rounded-lg object-contain shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] transition-opacity duration-700",
                  imageLoaded ? "opacity-100" : "opacity-0",
                )}
                style={{ maxHeight: "calc(100vh - 120px)" }}
              />
              {!imageLoaded && (
                <div
                  className="absolute inset-8 rounded-lg blur-2xl"
                  style={{ backgroundImage: image.blurData ? `url(${image.blurData})` : undefined, backgroundSize: "cover", opacity: 0.5 }}
                />
              )}
              <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 lg:flex">
                {image.palette.slice(0, 5).map((c) => (
                  <span key={c} className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20" style={{ background: c }} />
                ))}
              </div>
            </>
          )}
        </div>

        <div ref={scrollRef} className="w-full shrink-0 overflow-y-auto border-t border-white/[0.07] bg-[rgba(14,11,9,0.6)] p-5 lg:w-[400px] lg:border-l lg:border-t-0 lg:p-7">
          {loading || !image ? (
            <div className="space-y-3">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : (
            <div className="fade-up">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip !h-7 !cursor-default !text-[10.5px]" style={{ borderColor: `${image.categoryAccent}55`, color: "#f3dcc9" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: image.categoryAccent }} />
                  {image.categoryLabel}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.16em] text-muted">{image.aesthetic}</span>
              </div>

              <h2 className="serif mt-4 text-[27px] leading-[1.1] text-paper">{image.title}</h2>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/60">{image.description}</p>

              <div className="relative mt-5 flex items-center gap-2">
                <button onClick={toggleSave} className={cx("btn flex-1", saved ? "btn-primary" : "")}>
                  <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                  {saved ? "Saved" : "Save"}
                </button>
                <button className="btn" onClick={() => setPickerOpen((p) => !p)} title="Save to a collection">
                  Collections
                </button>
                <button className="btn btn-icon" onClick={copyPrompt} title="Copy prompt">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {pickerOpen && <CollectionPicker imageId={image.id} onClose={() => setPickerOpen(false)} onSaved={() => setSaved(true)} />}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={generateVariations} className="btn !h-9 !text-[11.5px]" disabled={variationState === "busy"}>
                  {variationState === "busy" ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} className="text-ember" />}
                  {variationState === "done" ? "Queued" : "Variations"}
                </button>
                <Link href={`/search?aesthetic=${encodeURIComponent(image.aesthetic)}`} className="btn !h-9 !text-[11.5px]">
                  <Sparkles size={12} className="text-ember" /> Aesthetic
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {image.tags.slice(0, 10).map((tag) => (
                  <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="chip !h-6 !px-2.5 !text-[10.5px]">
                    {tag}
                  </Link>
                ))}
              </div>

              <div className="mt-6 border-t border-white/[0.07] pt-5">
                <button onClick={() => setShowPrompt((s) => !s)} className="flex w-full items-center justify-between">
                  <span className="label">Generation prompt</span>
                  <span className="mono text-[9px] text-muted">{showPrompt ? "HIDE" : "SHOW"}</span>
                </button>
                {showPrompt && (
                  <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/30 p-3">
                    <p className="mono text-[10.5px] leading-relaxed text-paper/55">{image.prompt}</p>
                    <button onClick={copyPrompt} className="mono mt-2 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-ember/80 hover:text-ember">
                      {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? "Copied" : "Copy prompt"}
                    </button>
                  </div>
                )}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/[0.07] pt-5">
                {[
                  ["Generated", formatDate(image.publishedAt)],
                  ["Dimensions", `${image.width} × ${image.height}`],
                  ["Ratio", image.ratioLabel],
                  ["Model", image.model || "—"],
                  ["Provider", image.provider || "—"],
                  ["Palette", image.palette.slice(0, 3).join(" ")],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="label !text-[9px]">{k}</dt>
                    <dd className="mono mt-1 truncate text-[10.5px] text-paper/70">{v}</dd>
                  </div>
                ))}
              </dl>

              {data.related.length > 0 && (
                <div className="mt-6 border-t border-white/[0.07] pt-5">
                  <p className="label mb-3">More like this</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {data.related.slice(0, 6).map((rel) => (
                      <button key={rel.id} onClick={() => onNavigate(rel.id)} className="group relative aspect-square overflow-hidden rounded-md bg-ink-3">
                        <img src={rel.urls.thumb} alt={rel.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mono mt-6 flex items-center gap-1.5 border-t border-white/[0.07] pt-4 text-[9px] uppercase tracking-[0.16em] text-white/30">
                <Sparkles size={9} className="text-ember" /> Generated by the INFINITE agent
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
