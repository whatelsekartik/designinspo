/**
 * Standalone agent worker.
 *
 *   npm run agent              # boot with the configured interval
 *   npm run agent:once -- 8    # process exactly 8 generations, then exit
 *
 * This is the same runtime the web app hosts in-process, so a dedicated worker
 * process can be deployed separately (Docker, Render, Fly, a VPS, …) and the
 * web app can run with AGENT_AUTOSTART=false.
 */
import "dotenv/config";
import { getDb } from "@/lib/db";
import { ensureRuntime, getAgentStatus, control, tick } from "@/lib/agent/runtime";
import { providerStatus } from "@/lib/agent/providers";

async function main() {
  getDb();
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const countArg = args.find((a) => /^\d+$/.test(a));
  const count = countArg ? Number(countArg) : 0;
  const status = providerStatus();

  if (!status.configured) {
    console.error("\n✖ No image-generation provider configured.");
    console.error(`  Missing: ${status.missing.join(", ")}`);
    console.error("  Provide IMAGE_PROVIDER + the matching API key (see .env.example / the Studio ▸ Setup page).\n");
    if (!once) process.exit(1);
  } else {
    console.log(`✔ Provider: ${status.label} (${status.id}) · model ${status.model}`);
  }

  ensureRuntime();
  const snapshot = await getAgentStatus();
  console.log(`  Library: ${snapshot.counts.published} published · queue ${snapshot.counts.queued} · failed ${snapshot.counts.failed}`);

  if (once || count) {
    const target = count || 4;
    const res = await control("batch", { count: target });
    console.log(`  ${res.message}`);
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      await tick();
      const s = await getAgentStatus();
      const pending = s.counts.queued + s.counts.generating;
      if (pending === 0) break;
    }
    const final = await getAgentStatus();
    console.log(`  Done. Published ${final.counts.published} images · spent $${(final.spend.spentCents / 100).toFixed(2)}`);
    process.exit(final.counts.failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
