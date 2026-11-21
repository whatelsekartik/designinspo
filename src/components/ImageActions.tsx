"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Check, Copy, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import type { FeedImage } from "@/lib/types";
import { api, cx } from "@/lib/client";
import { useToast } from "./ToastProvider";
import { CollectionPicker } from "./CollectionPicker";

export function ImageActions({ image }: { image: FeedImage }) {
  const [saved, setSaved] = useState(image.saved);
  const [copied, setCopied] = useState(false);
  const [picker, setPicker] = useState(false);
  const [variation, setVariation] = useState<"idle" | "busy" | "done">("idle");
  const toast = useToast();

  const toggle = async () => {
    try {
      const res = await api<{ saved: boolean }>("/api/save", { method: "POST", body: JSON.stringify({ imageId: image.id }) });
      setSaved(res.saved);
      toast.push(res.saved ? "Saved" : "Removed from saved", "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save", "error");
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(image.prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const variations = async () => {
    setVariation("busy");
    try {
      const res = await api<{ message: string }>(`/api/images/${image.id}/variations`, { method: "POST", body: JSON.stringify({ count: 6 }) });
      setVariation("done");
      toast.push(res.message, "success");
    } catch (err) {
      setVariation("idle");
      toast.push(err instanceof Error ? err.message : "Could not queue variations", "error");
    }
  };

  return (
    <div className="relative mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggle} className={cx("btn", saved && "btn-primary")}>
          <Bookmark size={13} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}
        </button>
        <button onClick={() => setPicker((p) => !p)} className="btn">
          Collections
        </button>
        <a href={image.urls.full} download className="btn btn-icon" title="Download">
          <Download size={14} />
        </a>
        <button onClick={copy} className="btn btn-icon" title="Copy prompt">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={variations} className="btn !text-[11.5px]" disabled={variation === "busy"}>
          {variation === "busy" ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} className="text-ember" />}
          {variation === "done" ? "Variations queued" : "Generate variations"}
        </button>
        <Link href={`/search?aesthetic=${encodeURIComponent(image.aesthetic)}`} className="btn !text-[11.5px]">
          <Sparkles size={12} className="text-ember" /> Explore this aesthetic
        </Link>
      </div>
      {picker && <CollectionPicker imageId={image.id} onClose={() => setPicker(false)} onSaved={() => setSaved(true)} />}
    </div>
  );
}
