/**
 * Grow the library to a fixed size — unattended, resumable, budget-guarded.
 *
 *   npm run grow -- --target 1000 --yes                    # run until 1000 images
 *   npm run grow -- --target 1000 --budget 80 --yes        # raise the spend ceiling first
 *   npm run grow -- --target 1000 --concurrency 4 --yes    # more parallel generations
 *   npm run grow -- --target 1000 --dry-run                # write the prompts, spend nothing
 *
 * The loop is exactly the one the Studio drives: the agent enqueues ideas from
 * the compositional brain, the pipeline generates → QC → classifies → stores →
 * publishes, and `getAgentStatus()` is the single source of truth for progress.
 * Nothing is simulated: if no provider is configured the command refuses to run
 * and tells you what is missing.
 *
 * Resuming is trivial because all state lives in the database — re-run the same
 * command after a crash, a redeploy or a `Ctrl-C` and it continues from the
 * current published count.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { providerStatus } from "@/lib/agent/providers";
import { control, ensureRuntime, getAgentStatus, tick } from "@/lib/agent/runtime";
import { getBrainContext } from "@/lib/agent/pipeline";
import { buildIdea, composePrompt, tokenize } from "@/lib/agent/brain";
import { getSettings, setSettings } from "@/lib/repo/settings";

const ESTIMATED_CENTS = Math.max(1, Number(process.env.IMAGE_COST_CENTS || 4));

interface Args {
  target: number;
  budgetUsd: number | null;
  concurrency: number | null;
  hours: number;
  dryRun: boolean;
  yes: boolean;
  direction: string;
}

function parseArgs(argv: string[]): Args {
  const num = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i === -1) return null;
    const v = Number(argv[i + 1]);
    return Number.isFinite(v) ? v : null;
  };
  const str = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? "" : (argv[i + 1] ?? "");
  };
  return {
    target: Math.max(1, num("--target") ?? 1000),
    budgetUsd: num("--budget"),
    concurrency: num("--concurrency"),
    hours: num("--hours") ?? 12,
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    direction: str("--direction").trim(),
  };
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Dry run: enumerate the prompts the agent *would* spend money on, without
 * touching the database or a provider. Useful for pre-flight review, and for
 * handing the list to an external generator (`npm run ingest -- --dir …`).
 */
function dryRun(args: Args, missing: number) {
  const context = getBrainContext({ direction: args.direction });
  const counts = { ...context.counts };
  const memory = [...context.recentTokens];
  const fingerprints = [...context.recentFingerprints];
  const prompts: { categoryId: string; title: string; prompt: string; negativePrompt: string; aspect: number }[] = [];
  const perCategory: Record<string, number> = {};

  for (let i = 0; i < missing; i++) {
    const idea = buildIdea({
      context: { ...context, counts, recentTokens: memory, recentFingerprints: fingerprints, direction: args.direction },
      direction: args.direction,
      seed: Date.now() + i * 7919,
    });
    memory.push(tokenize(idea.prompt));
    fingerprints.push(idea.fingerprint);
    counts[idea.categoryId] = (counts[idea.categoryId] ?? 0) + 1;
    perCategory[idea.categoryId] = (perCategory[idea.categoryId] ?? 0) + 1;
    prompts.push({
      categoryId: idea.categoryId,
      title: idea.title,
      prompt: composePrompt(idea),
      negativePrompt: idea.negativePrompt,
      aspect: idea.ratio.w / idea.ratio.h,
    });
  }

  const outDir = path.resolve(".seed");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `prompts-${args.target}.json`);
  fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), target: args.target, prompts }, null, 2));
  // CSV for bulk tools: id,categoryId,title,aspect,prompt,negativePrompt
  const csvFile = file.replace(/\.json$/, ".csv");
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  fs.writeFileSync(
    csvFile,
    ["id,categoryId,title,aspect,prompt,negativePrompt"]
      .concat(prompts.map((p, i) => [i + 1, p.categoryId, p.title, p.aspect.toFixed(2), p.prompt, p.negativePrompt].map((v) => cell(String(v))).join(",")))
      .join("\n") + "\n",
  );
  const unique = new Set(prompts.map((p) => p.prompt)).size;
  console.log(`\n  Dry run — no provider calls, no spend.`);
  console.log(`  ${prompts.length} prompts across ${Object.keys(perCategory).length} categories (${unique} unique).`);
  console.log(`  Spread: ${Object.entries(perCategory).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  Written to ${path.relative(process.cwd(), file)} (+ .csv for bulk tools)`);
  console.log(`  Generate them externally, then: npm run ingest -- --manifest ${path.relative(process.cwd(), file)} --dir <folder>\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  getDb();
  ensureRuntime();

  const status = providerStatus();
  const before = await getAgentStatus();
  const published = before.counts.published;
  const missing = Math.max(0, args.target - published);

  console.log(`\n  INFINITE · grow to ${args.target}`);
  console.log(`  Library ${published} · remaining ${missing} · queue ${before.counts.queued}`);

  if (missing === 0) {
    console.log(`  Target already reached. Nothing to do.\n`);
    return;
  }

  if (args.dryRun) {
    dryRun(args, missing);
    return;
  }

  if (!status.configured) {
    console.error(`\n  ✖ No image-generation provider configured — refusing to pretend.`);
    console.error(`  Missing: ${status.missing.join(", ")}`);
    console.error(`  Add IMAGE_PROVIDER + its key to .env.local (see /setup or .env.example), then re-run.`);
    console.error(`  Nothing was spent and nothing was queued.\n`);
    process.exit(2);
  }

  const settings = getSettings();
  const estimateCents = missing * ESTIMATED_CENTS;
  let budgetCents = settings.budgetCents;

  if (args.budgetUsd !== null) {
    const requested = Math.round(args.budgetUsd * 100);
    if (requested < settings.spentCents + estimateCents) {
      console.error(
        `\n  ✖ --budget ${usd(requested)} is below the projected cost (${usd(settings.spentCents)} spent + ~${usd(estimateCents)}). Refusing to start.\n`,
      );
      process.exit(2);
    }
    budgetCents = requested;
  } else if (settings.spentCents + estimateCents > settings.budgetCents) {
    console.error(`\n  ✖ Projected cost ~${usd(estimateCents)} would exceed the current budget.`);
    console.error(`    Spent ${usd(settings.spentCents)} of ${usd(settings.budgetCents)} · ${missing} images × ~${usd(ESTIMATED_CENTS)}.`);
    console.error(`    Re-run with an explicit ceiling, e.g. --budget ${Math.ceil((settings.spentCents + estimateCents) / 100)}.\n`);
    process.exit(2);
  }

  console.log(`  Provider ${status.label} (${status.id}) · model ${status.model}`);
  console.log(`  Projected ~${usd(estimateCents)} for ${missing} images · budget ${usd(budgetCents)} (spent ${usd(settings.spentCents)})`);

  if (!args.yes && missing > 50) {
    console.error(`\n  This will spend real money on ${missing} generations. Add --yes to confirm.\n`);
    process.exit(2);
  }

  setSettings({
    running: true,
    pausedReason: null,
    budgetCents,
    ...(args.concurrency ? { concurrency: Math.max(1, Math.min(args.concurrency, 8)) } : {}),
    ...(args.direction ? { customDirection: args.direction } : {}),
  });

  const started = Date.now();
  const deadline = started + args.hours * 3600_000;
  let lastCount = published;
  let lastProgress = Date.now();
  let stalledTicks = 0;
  let printed = 0;

  const finish = async (code: number, note: string) => {
    const final = await getAgentStatus();
    const elapsed = (Date.now() - started) / 1000;
    console.log(`\n  ${note}`);
    console.log(`  Published ${final.counts.published} (${final.counts.published - published} this run) in ${Math.round(elapsed / 60)} min`);
    console.log(`  Spent ${usd(final.spend.spentCents)} · failed ${final.counts.failed} · queue ${final.counts.queued}`);
    if (final.counts.published < args.target) {
      console.log(`  Resume with: npm run grow -- --target ${args.target} --yes`);
    }
    console.log("");
    process.exit(code);
  };

  process.on("SIGINT", () => {
    void finish(130, "Interrupted — state is saved.");
  });

  while (true) {
    await tick();

    const s = await getAgentStatus();
    if (s.counts.published >= args.target) {
      await finish(0, "✔ Target reached.");
      return;
    }
    if (s.runtime === "awaiting_provider" || (s.pausedReason && /budget/i.test(s.pausedReason))) {
      await finish(1, `Stopped: ${s.pausedReason ?? "provider unavailable"}`);
      return;
    }
    if (Date.now() > deadline) {
      await finish(0, `Time limit (${args.hours}h) reached.`);
      return;
    }

    if (s.counts.published > lastCount) {
      lastCount = s.counts.published;
      lastProgress = Date.now();
      stalledTicks = 0;
    } else if (Date.now() - lastProgress > 90_000) {
      // Nothing published for 90s: nothing queued, or every job failed.
      stalledTicks++;
      if (s.counts.queued + s.counts.generating === 0) {
        const res = await control("batch", { count: Math.max(settings.batchSize, 10), direction: args.direction || undefined });
        console.log(`  Queue was empty — ${res.message}`);
      } else if (s.counts.failed > 0) {
        console.log(`  ${s.counts.failed} job(s) failed — retrying per policy.`);
      }
      lastProgress = Date.now();
      if (stalledTicks > 8) {
        await finish(1, "Stopped: no images published for several minutes.");
        return;
      }
    }

    const now = Date.now();
    if (now - printed > 15_000) {
      printed = now;
      const elapsedMin = (now - started) / 60_000;
      const rate = elapsedMin > 0.2 ? (s.counts.published - published) / elapsedMin : 0;
      const eta = rate > 0 ? Math.ceil((args.target - s.counts.published) / rate) : null;
      process.stdout.write(
        `\r  ${s.counts.published}/${args.target} · ${rate.toFixed(1)} img/min · ` +
          `queue ${s.counts.queued} · gen ${s.counts.generating} · ${usd(s.spend.spentCents)}` +
          (eta !== null ? ` · eta ${eta} min` : "") +
          "        ",
      );
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((err) => {
  console.error("\n  grow failed:", err instanceof Error ? err.message : err);
  console.error("  Re-run the same command to resume; state is in the database.\n");
  process.exit(1);
});
