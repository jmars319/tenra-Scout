import Link from "next/link";

import { AppFrame, Metric, MetricGrid, Panel } from "@scout/ui";

import { LeadInbox } from "@/components/LeadInbox";
import { LeadPipelineBoard } from "@/components/LeadPipelineBoard";
import { ManualLeadEntry } from "@/components/ManualLeadEntry";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  listLeadInboxItems,
  normalizeLeadInboxFilter
} from "@/lib/server/leads/lead-inbox-service";

interface LeadsPageProps {
  searchParams?: Promise<{
    filter?: string | string[] | undefined;
    q?: string | string[] | undefined;
  }>;
}

export const dynamic = "force-dynamic";

function isClosed(state: string): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = (await searchParams) ?? {};
  const filterParam = firstParam(params.filter);
  const queryParam = firstParam(params.q);
  const items = await listLeadInboxItems(500);
  const today = new Date().toISOString().slice(0, 10);
  const initialFilter = filterParam ? normalizeLeadInboxFilter(filterParam) : undefined;
  const initialSearch = queryParam?.trim() ?? "";
  const dueCount = items.filter(
    (item) =>
      item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  ).length;
  const savedCount = items.filter((item) => item.annotation.state === "saved").length;
  const contactedCount = items.filter((item) => item.annotation.state === "contacted").length;

  return (
    <AppFrame
      eyebrow="Scout leads"
      title="Lead Inbox"
      description="Cross-run lead workbench for saved businesses, follow-ups, notes, and report context."
      navigation={<ScoutNavigation currentView="leads" />}
      actions={
        <div className="header-actions">
          <Link className="secondary-button" href="/runs">
            Runs
          </Link>
          <ThemeToggle />
        </div>
      }
    >
      <div className="scout-shell">
        <MetricGrid>
          <Metric label="Tracked Leads" value={items.length} />
          <Metric label="Due" value={dueCount} tone={dueCount > 0 ? "warn" : "neutral"} />
          <Metric label="Saved" value={savedCount} tone="good" />
          <Metric label="Contacted" value={contactedCount} tone="warn" />
        </MetricGrid>

        <Panel
          title="Pipeline"
          description="A compact operating board for the current lead workload before opening the full inbox controls."
        >
          <LeadPipelineBoard items={items} today={today} />
        </Panel>

        <Panel
          title="Manual Lead Fallback"
          description="Use this for a single operator-entered lead when live acquisition misses a known business."
        >
          <ManualLeadEntry defaultMarket={queryParam} />
        </Panel>

        <Panel title="Lead Inbox">
          <LeadInbox
            initialFilter={initialFilter}
            initialItems={items}
            initialSearch={initialSearch}
            today={today}
          />
        </Panel>
      </div>
    </AppFrame>
  );
}
