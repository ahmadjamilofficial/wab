import { createFileRoute } from "@tanstack/react-router";
import { ConnectedSourcesTab } from "@/components/app/ConnectedSourcesTab";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/sources")({
  component: DataSources,
});

function DataSources() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Data Sources</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Connect and manage your data sources for continuous monitoring.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-surface p-6" style={{ border: "1px solid var(--hairline)" }}>
          <p className="mb-1 text-sm font-semibold">Connected Sources</p>
          <p className="mb-5 text-xs" style={{ color: "var(--ink-3)" }}>
            Wab monitors these sources continuously and acts on changes automatically.
          </p>
          <ConnectedSourcesTab orgId={profile?.org_id ?? ""} />
        </div>
      </div>
    </div>
  );
}
