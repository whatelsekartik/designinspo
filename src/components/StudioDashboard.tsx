"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Activity,
  CircleDot,
  Cpu,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import type { AgentStatus, Campaign } from "@/lib/types";
import { api, cx, formatCount, money, timeAgo } from "@/lib/client";
import { useToast } from "./ToastProvider";

type Status = AgentStatus & { settings: AgentStatus["settings"] & { spentCents: number; runtimeStartedAt: string | null } };

const EVENT_COLORS: Record<string, string> = {
  publish: "#9fb98b",
  generate: "#e1b06b",
  idea: "#c3a6e0",
  queue: "#8fa5b8",
  error: "#e4794a",
  control: "#d7c3ad",
  campaign: "#e7b57f",
  system: "#a9a094",
  classify: "#93a57c",
};

function Sparkline({ series }: { series: { t: string; n: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.n));
  const w = 520;
  const h = 84;
  const points = series.map((s, i) => `${(i / Math.max(1, series.length - 1)) * w},${h - (s.n / max) * (h - 8) - 4}`);
  const path = `M${points.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[84px] w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e4794a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#e4794a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={path} fill="none" stroke="#e4794a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="label !text-[9px]">{label}</p>
      <p className="mono mt-2 text-[22px] leading-none" style={{ color: accent ?? "#f6f0e7" }}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[10.5px] text-muted">{sub}</p>}
    </div>
  );
}

export function StudioDashboard({ initialStatus }: { initialStatus?: Status }) {
  const [status, setStatus] = useState<Status | null>(initialStatus ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(10);
  const [direction, setDirection] = useState("");
  const [target, setTarget] = useState(24);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api<Status>("/api/studio/status");
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the agent");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4500);
    return () => clearInterval(timer);
  }, [load]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      try {
        await api("/api/studio/settings", { method: "PATCH", body: JSON.stringify(body) });
        load();
      } catch (err) {
        toast.push(err instanceof Error ? err.message : "Could not save settings", "error");
      }
    },
    [load, toast],
  );

  const patchDebounced = useCallback(
    (body: Record<string, unknown>) => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => patch(body), 550);
    },
    [patch],
  );

  const run = async (action: string, extra: Record<string, unknown> = {}, key = action) => {
    setBusy(key);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/studio/control", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      toast.push(res.message, "success");
      load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const launchCampaign = async () => {
    if (direction.trim().length < 6) {
      toast.push("Describe the direction in a few more words.", "error");
      return;
    }
    setBusy("campaign");
    try {
      const res = await api<{ campaign: Campaign }>("/api/studio/campaign", {
        method: "POST",
        body: JSON.stringify({ direction, target }),
      });
      toast.push(`Campaign created — ${res.campaign.target_count} images in the manifest.`, "success");
      setDirection("");
      load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not create campaign", "error");
    } finally {
      setBusy(null);
    }
  };

  const exportManifest = async () => {
    setBusy("manifest");
    try {
      const res = await api<{ file: string; prompts: { prompt: string }[] }>("/api/studio/manifest", {
        method: "POST",
        body: JSON.stringify({ count: 12, direction: direction || undefined }),
      });
      toast.push(`Wrote ${res.prompts.length} prompts to storage/${res.file ?? "manifests"}.`, "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not export prompts", "error");
    } finally {
      setBusy(null);
    }
  };

  const togglePriority = (id: string) => {
    if (!status) return;
    const current = status.settings.priorityCategories;
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    patch({ priorityCategories: next });
    setStatus({ ...status, settings: { ...status.settings, priorityCategories: next } });
  };

  const settings = status?.settings;
  const runtime = status?.runtime;
  const providerReady = status?.provider.configured ?? false;
  const maxCategory = useMemo(() => Math.max(1, ...(status?.categories.map((c) => c.count) ?? [1])), [status]);

  return (
    <div className="mx-auto max-w-[1560px] px-4 pb-24 pt-[96px] md:px-8 md:pt-[112px]">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Sparkles size={11} className="text-ember" /> AI Studio
          </p>
          <h1 className="display mt-4 text-[clamp(32px,4.4vw,58px)] text-paper">
            The agent&apos;s <em>control room</em>.
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-paper/50">
            Real queue, real spend, real output. Everything below reads from the generation worker that is producing this library.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedFlash && <span className="mono text-[9px] uppercase tracking-[0.16em] text-moss">saved</span>}
          <div className="glass flex items-center gap-2.5 rounded-full px-3.5 py-2">
            <span className="pulse-dot" data-state={runtime === "running" ? "running" : providerReady ? "paused" : "waiting"} />
            <span className="mono text-[9.5px] uppercase tracking-[0.18em] text-paper/70">
              {runtime === "running" ? "Generating" : runtime === "awaiting_provider" ? "Awaiting provider" : "Paused"}
            </span>
            {status?.provider.configured && (
              <span className="mono border-l border-white/10 pl-2.5 text-[9.5px] text-paper/35">{status.provider.model}</span>
            )}
          </div>
          <button onClick={load} className="icon-btn" title="Refresh">
            <RefreshCw size={13} className={cx(busy === "refresh" && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="panel mt-6 border-ember/30 px-5 py-4 text-[12.5px] text-ember/90">
          {error} — the local database may still be starting.
        </div>
      )}

      {/* provider banner */}
      {status && !providerReady && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-ember/25 bg-gradient-to-r from-[rgba(228,121,74,0.12)] via-[rgba(228,121,74,0.05)] to-transparent p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-paper">
                <AlertTriangle size={14} className="text-ember" /> The generation engine is waiting for credentials
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-paper/60">
                The queue, worker, deduplication, classification and storage are all live. Nothing will be generated until an image provider
                is configured — the UI will never pretend otherwise.
              </p>
              <p className="mono mt-3 flex flex-wrap gap-1.5 text-[10px] text-ember/80">
                {status.provider.missing.map((m) => (
                  <span key={m} className="rounded border border-ember/25 bg-ember/10 px-2 py-1">
                    {m}
                  </span>
                ))}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/setup" className="btn btn-primary">
                Setup guide <ArrowUpRight size={13} />
              </Link>
              <button className="btn" onClick={exportManifest} disabled={busy === "manifest"}>
                {busy === "manifest" ? <RefreshCw size={12} className="animate-spin" /> : <Layers size={12} />} Export prompts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* metrics */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Images published" value={status ? formatCount(status.counts.published) : "—"} sub={status ? `${status.counts.today} today` : ""} />
        <Metric label="In queue" value={status ? String(status.counts.queued) : "—"} sub={status ? `${status.counts.generating} generating now` : ""} />
        <Metric label="Generation rate" value={status ? `${status.rate.perHour}/hr` : "—"} sub={status ? `${status.rate.perDay}/day this week` : ""} />
        <Metric label="Failed" value={status ? String(status.counts.failed) : "—"} sub="retried up to 3×" accent={status?.counts.failed ? "#e4794a" : undefined} />
        <Metric
          label="Spend / budget"
          value={status ? money(status.spend.spentCents) : "—"}
          sub={status ? `of ${money(status.spend.budgetCents)} configured` : ""}
          accent="#e1b06b"
        />
        <Metric label="Saved by you" value={status ? String(status.counts.saved) : "—"} sub={status ? `${status.counts.collections} collections` : ""} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        {/* ── LEFT ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="panel p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <p className="label">Generation rate · last 24h</p>
              <p className="mono text-[10px] text-muted">{status ? `${status.rate.series.reduce((a, s) => a + s.n, 0)} published` : ""}</p>
            </div>
            <div className="mt-3">{status ? <Sparkline series={status.rate.series} /> : <div className="skeleton h-[84px]" />}</div>
            <div className="mono mt-1 flex justify-between text-[8.5px] uppercase tracking-[0.14em] text-white/20">
              <span>-24h</span>
              <span>-18h</span>
              <span>-12h</span>
              <span>-6h</span>
              <span>now</span>
            </div>
          </div>

          {/* category coverage */}
          <div className="panel p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <p className="label">Category coverage</p>
              <p className="mono text-[9.5px] text-muted">click to prioritise</p>
            </div>
            <div className="mt-4 space-y-1.5">
              {status
                ? [...status.categories]
                    .filter((c) => c.count > 0 || c.priority || c.isEmerging)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 18)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => togglePriority(c.id)}
                        className={cx(
                          "group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition",
                          c.priority ? "bg-ember/[0.09] ring-1 ring-inset ring-ember/30" : "hover:bg-white/[0.04]",
                        )}
                        title={c.priority ? "Prioritised — click to remove" : "Click to prioritise this category"}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.accent }} />
                        <span className="w-[128px] shrink-0 truncate text-[11.5px] text-paper/75 md:w-[152px]">
                          {c.label}
                          {c.isEmerging && <span className="mono ml-1.5 text-[8px] uppercase tracking-wider text-ember/70">new</span>}
                        </span>
                        <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(2, (c.count / maxCategory) * 100)}%`, background: c.accent, opacity: c.priority ? 1 : 0.72 }}
                          />
                          <span className="absolute -top-[2px] h-[7px] w-px bg-white/35" style={{ left: `${Math.min(100, c.targetShare * 6)}%` }} />
                        </span>
                        <span className="mono w-9 shrink-0 text-right text-[10px] text-paper/50">{c.count}</span>
                        <span className="mono hidden w-10 shrink-0 text-right text-[9px] text-white/25 md:block">{c.share}%</span>
                      </button>
                    ))
                : Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-5 w-full" />)}
            </div>
            <p className="mono mt-3 border-t border-white/[0.06] pt-3 text-[9px] leading-relaxed tracking-[0.06em] text-white/25">
              The thin white tick marks each category&apos;s target share. The agent weights its ideas towards whatever is under-covered.
            </p>
          </div>

          {/* recent */}
          <div className="panel p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <p className="label">Recently published</p>
              <Link href="/" className="mono text-[9.5px] uppercase tracking-[0.14em] text-paper/35 hover:text-paper">
                Open feed →
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 md:grid-cols-8">
              {status?.recent.map((img) => (
                <Link key={img.id} href={`/image/${img.id}`} className="group relative block aspect-square overflow-hidden rounded-md bg-ink-3" title={img.title}>
                  <img src={img.urls.thumb} alt={img.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                </Link>
              ))}
              {status && status.recent.length === 0 && <p className="col-span-full py-4 text-[12px] text-muted">Nothing published yet.</p>}
            </div>
          </div>

          {/* queue */}
          <div className="panel overflow-hidden">
            <div className="flex items-baseline justify-between px-4 pt-4 md:px-5">
              <p className="label">Generation queue</p>
              <p className="mono text-[9.5px] text-muted">{status ? `${status.counts.queued} waiting · ${status.counts.generating} running` : ""}</p>
            </div>
            <div className="mt-2 max-h-[320px] overflow-y-auto">
              <table className="w-full text-left">
                <tbody>
                  {status?.queue.map((job) => {
                    const idea = (() => {
                      try {
                        return JSON.parse(job.idea_json) as { title?: string; aesthetic?: string };
                      } catch {
                        return {};
                      }
                    })();
                    return (
                      <tr key={job.id} className="border-t border-white/[0.05] text-[11.5px]">
                        <td className="w-8 py-2.5 pl-4 md:pl-5">
                          <span
                            className={cx("block h-1.5 w-1.5 rounded-full", job.status === "running" && "animate-pulse")}
                            style={{
                              background:
                                job.status === "running" ? "#e1b06b" : job.status === "queued" ? "#8fa5b8" : job.status === "failed" ? "#e4794a" : "#7d9b6d",
                            }}
                          />
                        </td>
                        <td className="max-w-[200px] truncate py-2.5 pr-3 text-paper/80">{idea.title ?? job.prompt.slice(0, 40)}</td>
                        <td className="hidden w-[120px] truncate py-2.5 pr-3 text-muted md:table-cell">{job.category_id?.replace(/-/g, " ")}</td>
                        <td className="mono hidden w-[72px] py-2.5 pr-3 text-[9.5px] uppercase tracking-[0.1em] text-muted md:table-cell">{job.status}</td>
                        <td className="mono w-[52px] py-2.5 pr-2 text-right text-[9.5px] text-white/30">{job.attempts}/{job.max_attempts}</td>
                        <td className="mono w-[64px] py-2.5 pr-4 text-right text-[9.5px] text-white/30 md:pr-5">{timeAgo(job.created_at)}</td>
                      </tr>
                    );
                  })}
                  {status && status.queue.length === 0 && (
                    <tr>
                      <td className="px-5 py-8 text-center text-[12px] text-muted" colSpan={6}>
                        The queue is empty. Start the agent or push a batch to fill it.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* campaigns */}
          <div className="panel p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <p className="label">Campaigns</p>
              <p className="mono text-[9.5px] text-muted">{status ? `${status.counts.campaigns} active` : ""}</p>
            </div>
            <div className="mt-3 space-y-2">
              {status?.campaigns.map((c) => {
                const done = c.completed_count + c.failed_count;
                const pct = Math.min(100, Math.round((done / Math.max(1, c.target_count)) * 100));
                return (
                  <div key={c.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12px] text-paper/80">{c.direction}</p>
                      <span className="mono shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted">{c.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-ember transition-all duration-700" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mono text-[9.5px] text-paper/45">
                        {c.completed_count}/{c.target_count}
                      </span>
                    </div>
                  </div>
                );
              })}
              {status && status.campaigns.length === 0 && (
                <p className="py-3 text-[12px] text-muted">No campaigns yet. Point the agent somewhere new with a creative direction below.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT ────────────────────────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-[80px]">
          <div className="panel p-4 md:p-5">
            <div className="flex items-center justify-between">
              <p className="label">Agent control</p>
              <Cpu size={13} className="text-white/30" />
            </div>

            <div className="mt-4 flex gap-2">
              {runtime === "running" ? (
                <button className="btn flex-1 !h-10" onClick={() => run("pause")} disabled={busy === "pause"}>
                  <Pause size={13} /> Pause generation
                </button>
              ) : (
                <button
                  className="btn btn-primary flex-1 !h-10"
                  onClick={() => run(providerReady ? "start" : "batch")}
                  disabled={busy === "start" || busy === "batch"}
                  title={providerReady ? "Start the continuous loop" : "No provider configured — this exports prompts instead"}
                >
                  <Play size={13} /> {providerReady ? "Start generation" : "Export prompt batch"}
                </button>
              )}
              <button className="btn !h-10 !px-3" onClick={() => run("batch", { count: batchCount }, "batch")} disabled={busy === "batch"}>
                <Zap size={13} className="text-ember" /> {busy === "batch" ? "Queuing…" : "Batch"}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label !text-[9px]">Batch size</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="field mt-1.5 !py-2 !text-[12px]"
                  defaultValue={settings?.batchSize ?? 10}
                  onBlur={(e) => patch({ batchSize: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label !text-[9px]">Batch now</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  className="field mt-1.5 !py-2 !text-[12px]"
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label !text-[9px]">Frequency</label>
                  <span className="mono text-[10px] text-paper/55">every {settings?.frequencySeconds ?? 90}s</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={600}
                  step={15}
                  defaultValue={settings?.frequencySeconds ?? 90}
                  onChange={(e) => patchDebounced({ frequencySeconds: Number(e.target.value) })}
                  className="mt-2"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label !text-[9px]">Concurrency</label>
                  <span className="mono text-[10px] text-paper/55">{settings?.concurrency ?? 2} workers</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  defaultValue={settings?.concurrency ?? 2}
                  onChange={(e) => patchDebounced({ concurrency: Number(e.target.value) })}
                  className="mt-2"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label !text-[9px]">Budget</label>
                  <span className="mono text-[10px] text-paper/55">{money(settings?.budgetCents ?? 0)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20000}
                  step={500}
                  defaultValue={settings?.budgetCents ?? 5000}
                  onChange={(e) => patchDebounced({ budgetCents: Number(e.target.value) })}
                  className="mt-2"
                />
                <p className="mono mt-2 text-[9px] text-white/25">
                  spent {money(settings?.spentCents ?? 0)} · avg {money(status?.spend.costPerImageCents ?? 0)}/image
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label !text-[9px]">Novelty threshold</label>
                  <span className="mono text-[10px] text-paper/55">{Math.round((settings?.noveltyThreshold ?? 0.55) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={95}
                  step={5}
                  defaultValue={Math.round((settings?.noveltyThreshold ?? 0.55) * 100)}
                  onChange={(e) => patchDebounced({ noveltyThreshold: Number(e.target.value) / 100 })}
                  className="mt-2"
                />
                <p className="mono mt-2 text-[9px] text-white/25">higher = more unusual concepts, fewer familiar ones</p>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-2.5">
              <span className="text-[11.5px] text-paper/70">Let the agent invent new directions</span>
              <span
                onClick={() => patch({ allowEmerging: !settings?.allowEmerging })}
                className={cx("relative h-[18px] w-[34px] shrink-0 rounded-full transition-colors", settings?.allowEmerging ? "bg-ember/80" : "bg-white/15")}
              >
                <span
                  className={cx(
                    "absolute top-[3px] h-3 w-3 rounded-full bg-paper transition-all",
                    settings?.allowEmerging ? "left-[18px]" : "left-[3px]",
                  )}
                />
              </span>
            </label>

            <button className="btn btn-ghost mt-2 w-full !justify-start !text-[10.5px] !text-white/30" onClick={() => run("reset-budget")}>
              <Settings2 size={11} /> Reset spend counter
            </button>
          </div>

          {/* creative direction */}
          <div className="panel p-4 md:p-5">
            <p className="label flex items-center gap-2">
              <Rocket size={11} className="text-ember" /> Creative direction
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-paper/45">
              Feed the agent a brief. It becomes a campaign that runs through the same queue.
            </p>
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={3}
              placeholder="Generate 200 futuristic website design concepts with unusual layouts, warm colors and experimental typography."
              className="field mt-3 !text-[12px]"
            />
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <label className="label !text-[8.5px]">Target images</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="field mt-1 !py-1.5 !text-[12px]"
                />
              </div>
              <button className="btn btn-primary mt-4 flex-1" onClick={launchCampaign} disabled={busy === "campaign"}>
                {busy === "campaign" ? <RefreshCw size={12} className="animate-spin" /> : <Rocket size={12} />} Launch
              </button>
            </div>
            {!providerReady && (
              <p className="mono mt-2 text-[9px] leading-relaxed text-ember/70">
                Without a provider the campaign is saved and starts automatically once credentials are added.
              </p>
            )}
          </div>

          {/* activity */}
          <div className="panel p-4 md:p-5">
            <div className="flex items-center justify-between">
              <p className="label flex items-center gap-2">
                <Activity size={11} className="text-ember" /> Agent activity
              </p>
              <span className="pulse-dot" data-state={runtime === "running" ? "running" : "paused"} />
            </div>
            <div className="mt-3 max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
              {status?.events.map((e) => (
                <div key={e.id} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_COLORS[e.kind] ?? "#a9a094" }} />
                  <div className="min-w-0">
                    <p className="text-[11px] leading-snug text-paper/70">{e.message}</p>
                    <p className="mono mt-0.5 text-[8.5px] uppercase tracking-[0.14em] text-white/25">
                      {e.kind} · {timeAgo(e.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {status && status.events.length === 0 && <p className="text-[11.5px] text-muted">No activity yet.</p>}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 text-[10.5px] text-paper/40">
              <CircleDot size={11} /> {status?.provider.label ?? "Provider"} {status?.provider.configured ? "connected" : "not configured"}
            </div>
            <Link href="/setup" className="mono text-[9px] uppercase tracking-[0.14em] text-paper/40 hover:text-paper">
              Docs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
