import { StudioDashboard } from "@/components/StudioDashboard";
import { ensureRuntime } from "@/lib/agent/runtime";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI Studio — INFINITE" };

export default function StudioPage() {
  ensureRuntime();
  return <StudioDashboard />;
}
