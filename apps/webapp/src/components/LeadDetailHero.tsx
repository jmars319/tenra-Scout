import Link from "next/link";

import type { LeadInboxItem } from "@scout/domain";
import { Tag } from "@scout/ui";

import type { HandoffTarget, LeadAction } from "./LeadDetailView.helpers";
import {
  humanizeLeadValue,
  labelForLeadOutreachStatus,
  labelForLeadStatus,
  toneForLeadOutreachStatus,
  toneForLeadStatus
} from "./lead-workflow-copy";
import { describeSampleQuality, toneForSampleQuality } from "./sample-quality-copy";

export function LeadDetailHero({
  deliverHandoff,
  item,
  pendingKey,
  runAction
}: {
  deliverHandoff: (target: HandoffTarget) => Promise<void>;
  item: LeadInboxItem;
  pendingKey: string | null;
  runAction: (action: LeadAction) => Promise<void>;
}) {
  return (
<div className="lead-detail-hero report-card">
        <div className="lead-detail-title">
          <div>
            <div className="section-label">Lead</div>
            <h2>{item.businessName}</h2>
            {item.primaryUrl ? (
              <a className="inline-link" href={item.primaryUrl} target="_blank" rel="noreferrer">
                {item.primaryUrl}
              </a>
            ) : null}
          </div>
          <div className="tag-row">
            <Tag tone={toneForLeadStatus(item.annotation.state)}>
              {labelForLeadStatus(item.annotation.state)}
            </Tag>
            <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
              {labelForLeadOutreachStatus(item.outreach.status)}
            </Tag>
            {item.sampleQuality ? (
              <Tag tone={toneForSampleQuality(item.sampleQuality)}>
                {describeSampleQuality(item.sampleQuality)}
              </Tag>
            ) : null}
            {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
            {item.provenance ? (
              <Tag tone={item.provenance === "manual" ? "warn" : "neutral"}>
                {item.provenance === "manual" ? "Operator-entered" : humanizeLeadValue(item.provenance)}
              </Tag>
            ) : null}
          </div>
        </div>

        <div className="lead-detail-actions">
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("analyze_contact")}
            type="button"
          >
            {pendingKey === "analyze_contact" ? "Analyzing..." : "Analyze Contact"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("generate_draft")}
            type="button"
          >
            {pendingKey === "generate_draft" ? "Generating..." : "Generate Draft"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("mark_contacted")}
            type="button"
          >
            {pendingKey === "mark_contacted" ? "Marking..." : "Mark Contacted"}
          </button>
          <Link className="link-button" href={`/runs/${encodeURIComponent(item.runId)}`}>
            Report
          </Link>
          <a
            className="secondary-button"
            href={`/api/handoffs/opportunity/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Handoff
          </a>
          <a
            className="secondary-button"
            href={`/api/handoffs/proxy-shape/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Proxy Shape JSON
          </a>
          <a
            className="secondary-button"
            href={`/api/runs/${encodeURIComponent(item.runId)}/leads/${encodeURIComponent(item.candidateId)}/export?format=markdown`}
          >
            Lead Pack
          </a>
          <a
            className="secondary-button"
            href={`/api/runs/${encodeURIComponent(item.runId)}/leads/${encodeURIComponent(item.candidateId)}/export?format=json`}
          >
            Pack JSON
          </a>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("assembly")}
            type="button"
          >
            {pendingKey === "deliver-assembly" ? "Sending..." : "Send Assembly"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("proxy")}
            type="button"
          >
            {pendingKey === "deliver-proxy" ? "Sending..." : "Send Proxy"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("guardrail")}
            type="button"
          >
            {pendingKey === "deliver-guardrail" ? "Sending..." : "Send Guardrail"}
          </button>
          </div>
        </div>
  );
}
