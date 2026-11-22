import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, Code2, Database, Image as ImageIcon, Server, Sparkles } from "lucide-react";
import { providerStatus, PROVIDERS } from "@/lib/agent/providers";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — INFINITE" };

const STEPS = [
  { n: "01", title: "Pick a provider", body: "OpenAI, Gemini, fal.ai, Replicate or Stability. Any one of them is enough." },
  { n: "02", title: "Add the key", body: "Put IMAGE_PROVIDER and the matching API key in .env.local (or your host's secrets)." },
  { n: "03", title: "Boot the worker", body: "The web server starts the loop automatically. Or run npm run agent as a dedicated process." },
  { n: "04", title: "Watch it fill", body: "The agent invents concepts, generates, dedupes, classifies and publishes. The feed grows." },
];

export default function SetupPage() {
  const status = providerStatus();
  const db = getDb();
  const images = (db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number }).n;
  const jobs = (db.prepare("SELECT COUNT(*) AS n FROM generation_jobs").get() as { n: number }).n;

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-28 pt-[96px] md:px-8 md:pt-[112px]">
      <p className="eyebrow flex items-center gap-2">
        <Code2 size={11} className="text-ember" /> Setup & architecture
      </p>
      <h1 className="display mt-4 text-[clamp(32px,4.4vw,60px)] text-paper">
        Wire the engine, then <em>let it run</em>.
      </h1>
      <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-paper/55">
        INFINITE is a real system: a SQLite/Supabase database, durable object storage, an asynchronous generation queue and a worker that
        runs independently of your browser. Only one thing is missing out of the box — an image-generation credential.
      </p>

      {/* status */}
      <div className={`mt-8 rounded-2xl border p-5 ${status.configured ? "border-moss/30 bg-moss/[0.06]" : "border-ember/25 bg-ember/[0.06]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-paper">
              {status.configured ? <Check size={15} className="text-moss" /> : <AlertTriangle size={15} className="text-ember" />}
              {status.configured ? `Provider connected — ${status.label}` : "No provider configured"}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-paper/55">
              {status.configured
                ? `Model ${status.model}. The agent will generate through this provider; spend is tracked per image.`
                : "Until an API key exists, the queue accepts jobs, the worker reports honestly, and nothing is published. No placeholder images, no simulated stats."}
            </p>
          </div>
          <div className="mono flex flex-wrap gap-1.5 text-[10px]">
            {(status.configured ? [status.id, status.model] : status.missing).map((m) => (
              <span
                key={m}
                className={`rounded border px-2 py-1 ${status.configured ? "border-moss/30 text-moss" : "border-ember/30 text-ember/90"}`}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="mono mt-4 grid gap-2 border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.12em] text-paper/40 sm:grid-cols-3">
          <span><span className="text-paper/70">{images}</span> images stored</span>
          <span><span className="text-paper/70">{jobs}</span> jobs recorded</span>
          <span>db: sqlite (embedded) · storage: {process.env.STORAGE_DRIVER || "local"}</span>
        </div>
      </div>

      {/* steps */}
      <div className="mt-10 grid gap-3 md:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="panel p-4">
            <p className="mono text-[10px] text-ember/80">{s.n}</p>
            <p className="mt-3 text-[13px] font-medium text-paper">{s.title}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-paper/45">{s.body}</p>
          </div>
        ))}
      </div>

      {/* env */}
      <section className="mt-10">
        <h2 className="serif text-[22px] text-paper">1 · Configure the provider</h2>
        <p className="mt-2 text-[12.5px] text-paper/50">
          Copy <code className="mono rounded bg-white/5 px-1.5 py-0.5 text-[11px]">.env.example</code> to{" "}
          <code className="mono rounded bg-white/5 px-1.5 py-0.5 text-[11px]">.env.local</code> and fill in one provider block.
        </p>
        <pre className="mono mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[11px] leading-relaxed text-paper/70">
{`# ── OpenAI ───────────────────────────────
IMAGE_PROVIDER=openai
OPENAI_API_KEY=sk-…

# ── Google Gemini ────────────────────────
IMAGE_PROVIDER=gemini
GEMINI_API_KEY=…

# ── fal.ai (FLUX) ────────────────────────
IMAGE_PROVIDER=fal
FAL_KEY=…

# ── Replicate ────────────────────────────
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_…

# ── Stability AI ─────────────────────────
IMAGE_PROVIDER=stability
STABILITY_API_KEY=sk-…

# Optional tuning
IMAGE_MODEL=            # override the default model
IMAGE_QUALITY=medium    # low | medium | high (OpenAI)
IMAGE_COST_CENTS=       # override the per-image cost used for budgets
AGENT_AUTOSTART=true    # boot the loop inside the web server
INITIAL_BATCH_SIZE=40   # first population batch when a provider appears`}
        </pre>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-white/[0.03] text-[9.5px] uppercase tracking-[0.14em] text-white/35">
              <tr>
                <th className="px-4 py-2.5 font-normal">Provider</th>
                <th className="px-4 py-2.5 font-normal">Environment</th>
                <th className="px-4 py-2.5 font-normal">Default model</th>
                <th className="hidden px-4 py-2.5 font-normal md:table-cell">Cost</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.05]">
                  <td className="px-4 py-2.5 text-paper/80">{p.label}</td>
                  <td className="mono px-4 py-2.5 text-[10px] text-paper/45">{p.envKeys.join(" / ")}</td>
                  <td className="mono px-4 py-2.5 text-[10px] text-paper/45">{p.defaultModel}</td>
                  <td className="hidden px-4 py-2.5 text-[10.5px] text-paper/35 md:table-cell">{p.costHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* worker */}
      <section className="mt-12">
        <h2 className="serif text-[22px] text-paper">2 · Run the worker</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="panel p-4">
            <p className="label flex items-center gap-2"><Server size={11} /> In-process (single node)</p>
            <p className="mt-2 text-[12px] leading-relaxed text-paper/50">
              With <code className="mono text-[11px]">AGENT_AUTOSTART=true</code> the Next.js server boots the runtime on start. Fine for a
              preview, a small VPS, or a single container.
            </p>
            <pre className="mono mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[10.5px] text-paper/60">{`npm run dev
# or
npm run build && npm start`}</pre>
          </div>
          <div className="panel p-4">
            <p className="label flex items-center gap-2"><CpuIcon /> Dedicated process</p>
            <p className="mt-2 text-[12px] leading-relaxed text-paper/50">
              Deploy the worker separately and set <code className="mono text-[11px]">AGENT_AUTOSTART=false</code> on the web server. Both
              processes share the same database and storage.
            </p>
            <pre className="mono mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[10.5px] text-paper/60">{`npm run agent           # continuous loop
npm run agent:once 8    # drain 8 jobs, then exit
npm run grow -- --target 1000 --yes   # run until 1,000 published
curl -X POST /api/agent/tick   # cron-driven ticks`}</pre>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="mt-12">
        <h2 className="serif text-[22px] text-paper">What the agent actually does</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[
            { t: "Idea", d: "Samples its category coverage map and invents a concept weighted toward under-represented directions." },
            { t: "Prompt", d: "Composes a detailed prompt from medium, subject, material, light, palette and composition vocabularies." },
            { t: "Generate", d: "The worker calls the provider with retries, rate-limit awareness and a budget guard." },
            { t: "Quality gate", d: "Checks resolution and pixel variance, then computes a perceptual hash to reject near-duplicates." },
            { t: "Classify", d: "Derives category, aesthetic, tags and a real palette from the generated pixels." },
            { t: "Store", d: "Writes immutable webp variants (512 / 960 / 1600) to object storage with blur placeholders." },
            { t: "Publish", d: "Inserts the row, syncs full-text search, memorises the concept and updates coverage." },
            { t: "Repeat", d: "The runtime refills the queue on its frequency, and discovers new categories as it learns." },
          ].map((s, i) => (
            <div key={s.t} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <p className="mono text-[9px] text-white/25">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-2 text-[12px] text-paper/80">{s.t}</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-paper/40">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* manifests */}
      <section className="mt-12">
        <h2 className="serif text-[22px] text-paper">No API budget? Use the manifest workflow</h2>
        <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-paper/50">
          The agent can compose prompts without generating pixels. Export a manifest, fulfil it with any external image generator, then ingest the
          files — they still pass through the same quality gate, dedupe, classification, storage and publication pipeline.
        </p>
        <pre className="mono mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[11px] leading-relaxed text-paper/65">
{`# 1. Agent writes fully-composed prompts (12 by default)
npm run concepts                       # curated seed concepts → .seed/manifest.json
#    or from the studio: POST /api/studio/manifest

# 2. Generate the images for those prompts with any tool

# 3. Ingest them through the real pipeline
npm run ingest -- --manifest .seed/manifest.json --dir .seed/raw
#   → quality check · dedupe · variants · storage · classification · publish`}
        </pre>
      </section>

      {/* supabase */}
      <section className="mt-12">
        <h2 className="serif text-[22px] text-paper">3 · Production: Supabase + object storage</h2>
        <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-paper/50">
          The runtime database is the embedded SQLite store (WAL + FTS5) — zero configuration. For a hosted deployment, the validated Postgres
          schema with full-text search, indexes and row-level security lives in <code className="mono text-[11px]">supabase/migrations</code>,
          and object storage can move to a Supabase bucket today.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="panel p-4">
            <p className="label flex items-center gap-2"><Database size={11} /> Database</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-paper/45">
              <code className="mono text-[10.5px]">supabase/migrations/0001_init.sql</code> — 11 tables, generated tsvector search column with
              GIN index, RLS and feed helpers. Validated on Postgres 17; the data adapter is the remaining work.
            </p>
          </div>
          <div className="panel p-4">
            <p className="label flex items-center gap-2"><ImageIcon size={11} /> Storage</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-paper/45">
              Create a public bucket (default <code className="mono text-[10.5px]">infinite-media</code>) and set{" "}
              <code className="mono text-[10.5px]">STORAGE_DRIVER=supabase</code> with the service-role key on the server only. Implemented today.
            </p>
          </div>
          <div className="panel p-4">
            <p className="label flex items-center gap-2"><Sparkles size={11} /> Notes</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-paper/45">
              See <code className="mono text-[10.5px]">supabase/README.md</code> for the exact steps. Keys never reach the browser; all writes go
              through the worker.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-2">
        <Link href="/studio" className="btn btn-primary">
          Open the AI Studio <ArrowUpRight size={13} />
        </Link>
        <Link href="/" className="btn">Back to discovery</Link>
      </div>
    </div>
  );
}

function CpuIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  );
}
