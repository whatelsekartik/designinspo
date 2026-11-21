export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AGENT_AUTOSTART === "false") return;
  try {
    const { ensureRuntime } = await import("@/lib/agent/runtime");
    ensureRuntime();
  } catch (err) {
    console.error("[agent] failed to boot runtime", err);
  }
}
