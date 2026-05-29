import { APP_NAME } from "@scout/config";
import { AppFrame, Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import { RecentRunsPanel } from "@/components/RecentRunsPanel";
import { OperatorReadinessPanel } from "@/components/OperatorReadinessPanel";
import { RunForm } from "@/components/RunForm";
import { SavedMarketsPanel } from "@/components/SavedMarketsPanel";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listRecentScoutRuns, listSavedMarkets } from "@/lib/server/scout-runner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [recentRuns, savedMarkets] = await Promise.all([
    listRecentScoutRuns(6),
    listSavedMarkets(6)
  ]);
  const handoffTargets = [
    {
      label: "Registry",
      tone: "good" as const,
      text: "Lead identity, business details, audit evidence, and opportunity classification become intake context."
    },
    {
      label: "Assembly",
      tone: "good" as const,
      text: "Approved evidence packs can become content briefs, case notes, or outreach review drafts."
    },
    {
      label: "Proxy",
      tone: "warn" as const,
      text: "Outgoing language stays draft-only until Proxy rewrites and validates it against the selected voice profile."
    }
  ];

  return (
    <AppFrame
      eyebrow="Scout v1"
      title={APP_NAME}
      description="Desktop-first live-search market scanning for who exists, what kind of web presence they have, what is broken or missing, and which businesses are worth acting on."
      navigation={<ScoutNavigation currentView="home" />}
      actions={<ThemeToggle />}
    >
      <div className="scout-shell">
        <div id="new-scan">
          <Panel
            title="Run a market scan"
            description="Start with a structured business type plus city/state, or override it with one custom query. Scout still runs the same narrow flow: resolve market intent, gather 10 to 15 candidate presences, audit owned websites where possible, and return a deterministic report."
          >
            <RunForm />
          </Panel>
        </div>

        <MetricGrid>
          <Metric label="Flow" value="Input → Run → Report" />
          <Metric label="Search Scope" value="10–15 candidates" />
          <Metric label="Audit Passes" value="Desktop + Mobile" />
          <Metric label="Evidence" value="Screenshots per page" />
        </MetricGrid>

        <Panel
          title="Operator Readiness"
          description="Local checks for Postgres, worker heartbeat, provider posture, outreach drafting, handoff endpoints, and evidence storage."
        >
          <OperatorReadinessPanel />
        </Panel>

        <div className="scout-grid two-up">
          <Panel title="What Scout Is">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="good">Market scanner</Tag>
              <Tag tone="good">Deterministic audit</Tag>
              <Tag tone="good">Lead shortlist</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Scout is live-search and evidence-led. It classifies owned sites, directory-only
              presences, social-only presences, dead sites, blocked sites, and unclear results before
              deciding what should be audited.
            </p>
          </Panel>

          <Panel title="What Scout Is Not">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="warn">Not a crawler</Tag>
              <Tag tone="warn">Not an SEO suite</Tag>
              <Tag tone="warn">Not an AI-first app</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              The MVP stays thin: one query, one run, one report. No dashboard sprawl, no outreach
              automation, no deep crawl, and no AI pretending to replace deterministic evidence.
              AI only helps draft grounded follow-up after Scout has already produced a local report.
            </p>
          </Panel>
        </div>

        <RecentRunsPanel runs={recentRuns} />

        <Panel
          title="Suite Handoff"
          description="Scout should stay evidence-first. These handoffs make the next action explicit instead of hiding it behind automated outreach."
        >
          <div className="scout-grid three-up">
            {handoffTargets.map((target) => (
              <div key={target.label} className="handoff-card">
                <Tag tone={target.tone}>{target.label}</Tag>
                <p className="muted" style={{ margin: "0.8rem 0 0", lineHeight: 1.6 }}>
                  {target.text}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Saved Markets"
          description="Completed market scans are grouped here so you can re-scan the same market and compare fresh results against the previous report."
        >
          <SavedMarketsPanel markets={savedMarkets} />
        </Panel>
      </div>
    </AppFrame>
  );
}
