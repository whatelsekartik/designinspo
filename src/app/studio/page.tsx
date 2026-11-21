import { StudioDashboard } from "@/components/StudioDashboard";
import { ensureRuntime, getAgentStatus } from "@/lib/agent/runtime";
import { getSettings } from "@/lib/repo/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI Studio — INFINITE" };

export default async function StudioPage() {
  ensureRuntime();
  const status = await getAgentStatus();
  const settings = getSettings();
  return (
    <StudioDashboard
      initialStatus={{
        ...status,
        settings: { ...status.settings, spentCents: settings.spentCents, runtimeStartedAt: settings.runtimeStartedAt },
      }}
    />
  );
}
