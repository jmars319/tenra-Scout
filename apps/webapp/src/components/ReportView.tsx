import Link from "next/link";

import type {
  LeadAnnotation,
  OutreachDraft,
  OutreachLength,
  OutreachTone,
  ScoutRunReport
} from "@scout/domain";
import { Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import { CandidateReviewPanel } from "./CandidateReviewPanel";
import { LeadTriagePanel } from "./LeadTriagePanel";
import { OutreachWorkspace } from "./OutreachWorkspace";
import {
  buildLeadTriageItems,
  buildListKey,
  buildSampleConfidenceReasons,
  buildSampleDecisionRows,
  describeAcquisitionTrust,
  describeAttemptOutcome,
  describeCandidateProvenance,
  describeProviderName,
  describeQueryVariantLabel,
  groupFindings,
  humanize,
  toneForAcquisitionTrust,
  toneForConfidence,
  toneForQuality,
  toneForSampleMetric,
  toneForSeverity
} from "./ReportView.helpers";
import {
  describeSampleQuality,
  describeSampleQualityMeaning,
  toneForSampleQuality
} from "./sample-quality-copy";
import { RunControlActions } from "./RunControlActions";
import type { MarketComparison } from "@/lib/server/market-comparison";
import { BusinessBreakdownsPanel, MarketComparisonPanel } from "./ReportViewSections";

export function ReportView({
  report,
  outreach,
  leadAnnotations,
  marketComparison
}: {
  report: ScoutRunReport;
  outreach: {
    aiAvailable: boolean;
    defaultTone: OutreachTone;
    defaultLength: OutreachLength;
    model?: string | undefined;
    drafts: OutreachDraft[];
  };
  leadAnnotations: LeadAnnotation[];
  marketComparison?: MarketComparison | null | undefined;
}) {
  const findingsByCandidate = groupFindings(report.findings);
  const ownedWebsiteCount = report.presences.filter(
    (presence) => presence.presenceType === "owned_website"
  ).length;
  const acquisitionVariants = report.acquisition.queryVariants.filter(
    (variant) => variant.rawResultCount > 0 || variant.acceptedResultCount > 0
  );
  const acquisitionSources = report.acquisition.candidateSources.filter(
    (source) => source.rawCandidateCount > 0 || source.selectedCandidateCount > 0
  );
  const degradedLiveAttempts = report.acquisition.providerAttempts.filter(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success"
  );
  const sampleConfidenceReasons = buildSampleConfidenceReasons(report);
  const sampleDecisionRows = buildSampleDecisionRows(report);
  const candidatesById = new Map(report.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const leadTriageItems = buildLeadTriageItems(report, leadAnnotations);

  return (
    <div className="scout-shell">
      {report.status === "failed" ? (
        <div className="error-banner">
          <strong>Run failed.</strong>
          <div style={{ marginTop: "0.45rem" }}>
            {report.errorMessage || "Scout stopped before report completion."}
          </div>
        </div>
      ) : null}

      <MetricGrid>
        <Metric label="Candidates" value={report.summary.totalCandidates} />
        <Metric label="Owned Sites" value={ownedWebsiteCount} />
        <Metric label="Audited" value={report.summary.auditedPresences} tone="good" />
        <Metric label="Skipped" value={report.summary.skippedPresences} />
        <Metric
          label="Market Confidence"
          value={describeSampleQuality(report.summary.sampleQuality)}
          tone={toneForSampleMetric(report.summary.sampleQuality)}
        />
        <Metric label="Shortlist" value={report.shortlist.length} tone="warn" />
      </MetricGrid>

      <Panel
        title="Run Operations"
        description="Queue another scan from the same query, or retry this run if it ended before a report could be completed."
      >
        <RunControlActions runId={report.runId} status={report.status} />
      </Panel>

      <MarketComparisonPanel marketComparison={marketComparison} />

      <div className="scout-grid report-overview-grid">
        <Panel title="Market Summary">
          <div className="tag-row" style={{ marginBottom: "0.9rem" }}>
            <Tag tone="good">{describeProviderName(report.searchSource)}</Tag>
            <Tag tone={toneForSampleQuality(report.summary.sampleQuality)}>
              {describeSampleQuality(report.summary.sampleQuality)}
            </Tag>
            {report.intent.locationLabel ? <Tag>{report.intent.locationLabel}</Tag> : null}
            {report.intent.categories.map((category) => (
              <Tag key={category}>{humanize(category)}</Tag>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 0, lineHeight: 1.65 }}>
            Scout normalized the query to <strong>{report.intent.searchQuery}</strong>, kept every
            candidate presence, audited only deterministic owned-site targets, and marked the rest
            as skipped with explicit presence notes.
          </p>

          <div className="scout-grid two-up" style={{ marginTop: "1rem" }}>
            <div>
              <div className="section-label">Presence Breakdown</div>
              <table className="finding-table">
                <tbody>
                  {Object.entries(report.summary.presenceBreakdown).map(([presenceType, count]) => (
                    <tr key={presenceType}>
                      <td>{humanize(presenceType)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="section-label">Quality Breakdown</div>
              <table className="finding-table">
                <tbody>
                  {Object.entries(report.summary.qualityBreakdown).map(([quality, count]) => (
                    <tr key={quality}>
                      <td>{humanize(quality)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel title="Acquisition">
          <div className="tag-row" style={{ marginBottom: "0.9rem" }}>
            <Tag tone={toneForAcquisitionTrust(report)}>
              {describeProviderName(report.acquisition.provider)}
            </Tag>
            {report.acquisition.fallbackUsed ? <Tag tone="warn">Fallback Used</Tag> : null}
            <Tag tone={toneForSampleQuality(report.acquisition.sampleQuality)}>
              {describeSampleQuality(report.acquisition.sampleQuality)}
            </Tag>
          </div>

          <p className="muted" style={{ marginTop: 0, marginBottom: "0.9rem", lineHeight: 1.65 }}>
            {describeAcquisitionTrust(report)}
          </p>

          <div className="sample-confidence-summary">
            <div className="section-label">Market Confidence</div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
              <strong>{describeSampleQuality(report.acquisition.sampleQuality)}.</strong>{" "}
              {describeSampleQualityMeaning(report.acquisition.sampleQuality)}
            </p>
            <ul className="note-list">
              {sampleConfidenceReasons.map((reason, index) => (
                <li key={buildListKey("sample-confidence-reason", index)}>{reason}</li>
              ))}
            </ul>
            <div className="sample-decision-grid">
              {sampleDecisionRows.map((row) => (
                <div className="sample-decision-row" key={row.label}>
                  <span>{row.label}</span>
                  <Tag tone={row.tone}>{row.value}</Tag>
                </div>
              ))}
            </div>
          </div>

          <p className="muted" style={{ marginTop: 0, lineHeight: 1.65 }}>
            Scout gathered <strong>{report.acquisition.rawCandidateCount}</strong> raw results,
            merged <strong>{report.acquisition.mergedDuplicateCount}</strong>, discarded{" "}
            <strong>{report.acquisition.discardedCandidateCount}</strong>, and kept{" "}
            <strong>{report.acquisition.selectedCandidateCount}</strong> final candidates for this
            run.
          </p>

          <div className="tag-row">
            <Tag tone="good">Live {report.acquisition.liveCandidateCount}</Tag>
            <Tag tone={report.acquisition.fallbackCandidateCount > 0 ? "warn" : "neutral"}>
              Fallback {report.acquisition.fallbackCandidateCount}
            </Tag>
            {acquisitionSources.map((source) => (
              <Tag
                key={source.source}
                tone={source.kind === "fallback" ? "warn" : "neutral"}
              >
                {describeProviderName(source.source)} kept {source.selectedCandidateCount}
              </Tag>
            ))}
          </div>

          <div className="section-stack" style={{ marginTop: "1rem" }}>
            <div className="section-label">Query Variants</div>
            {acquisitionVariants.length > 0 ? (
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>Query</th>
                    <th>Raw</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {acquisitionVariants.map((variant) => (
                    <tr key={`${variant.label}-${variant.query}`}>
                      <td>{describeQueryVariantLabel(variant.label)}</td>
                      <td>{variant.query}</td>
                      <td>{variant.rawResultCount}</td>
                      <td>{variant.acceptedResultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Scout did not record any usable query-variant acquisition for this run.
              </p>
            )}
          </div>

          {acquisitionSources.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Source Contribution</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Kind</th>
                    <th>Raw</th>
                    <th>Kept</th>
                  </tr>
                </thead>
                <tbody>
                  {acquisitionSources.map((source) => (
                    <tr key={`${source.kind}-${source.source}`}>
                      <td>{describeProviderName(source.source)}</td>
                      <td>{humanize(source.kind)}</td>
                      <td>{source.rawCandidateCount}</td>
                      <td>{source.selectedCandidateCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {degradedLiveAttempts.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Live Provider Attempts</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Variant</th>
                    <th>Outcome</th>
                    <th>Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {degradedLiveAttempts.map((attempt) => (
                    <tr key={`${attempt.provider}-${attempt.variantLabel}-${attempt.query}-${attempt.outcome}`}>
                      <td>{describeProviderName(attempt.provider)}</td>
                      <td>{describeQueryVariantLabel(attempt.variantLabel)}</td>
                      <td>{describeAttemptOutcome(attempt.outcome)}</td>
                      <td>{attempt.rawResultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {report.acquisition.notes.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Acquisition Notes</div>
              <ul className="note-list">
                {report.acquisition.notes.map((note, index) => (
                  <li key={buildListKey("acquisition-note", index)}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel title="Common Issues">
          {report.summary.commonIssues.length > 0 ? (
            <ul className="issue-list">
              {report.summary.commonIssues.map((issue) => (
                <li key={issue.issueType} className="report-card compact-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <strong>{humanize(issue.issueType)}</strong>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        Count across audited pages and viewports
                      </div>
                    </div>
                    <Tag tone={toneForSeverity(issue.count >= 4 ? "high" : "medium")}>
                      {issue.count}
                    </Tag>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No deterministic findings were recorded for this run.
            </p>
          )}
        </Panel>
      </div>

      {report.status === "completed" ? (
        <Panel
          title="Acquisition Review"
          description="Add a known business or promote a discarded acquisition result. Scout will run the same presence, audit, classification, and shortlist rules against the added candidate."
        >
          <CandidateReviewPanel
            discardedCandidates={report.acquisition.discardedCandidates}
            runId={report.runId}
          />
        </Panel>
      ) : null}

      <Panel
        title="Shortlist"
        description="Highest-priority business opportunities ranked from Scout's deterministic presence and audit rules. Directory and marketplace pages stay below in the full market picture."
      >
        {report.shortlist.length > 0 ? (
          <ul className="shortlist">
            {report.shortlist.map((lead, index) => (
              <li key={lead.candidateId} className="report-card">
                <header>
                  <div>
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{lead.businessName}</div>
                    <Link className="inline-link" href={lead.primaryUrl} target="_blank">
                      {lead.primaryUrl}
                    </Link>
                  </div>
                  <Tag tone="warn">Shortlist #{index + 1}</Tag>
                </header>

                <div className="tag-row">
                  <Tag>{humanize(lead.presenceType)}</Tag>
                  <Tag tone={toneForQuality(lead.presenceQuality)}>
                    {humanize(lead.presenceQuality)}
                  </Tag>
                  <Tag tone={toneForConfidence(lead.confidence)}>
                    {humanize(lead.confidence)}
                  </Tag>
                  <Tag>{describeCandidateProvenance(candidatesById.get(lead.candidateId)?.provenance)}</Tag>
                  {lead.opportunityTypes.map((opportunity) => (
                    <Tag key={opportunity} tone="good">
                      {humanize(opportunity)}
                    </Tag>
                  ))}
                </div>

                <ul className="note-list">
                  {lead.reasons.map((reason, index) => (
                    <li key={buildListKey(`shortlist-reason-${lead.candidateId}`, index)}>
                      {reason}
                    </li>
                  ))}
                </ul>
                <div className="lead-detail-actions">
                  <Link
                    className="secondary-button"
                    href={`/api/handoffs/opportunity/${encodeURIComponent(report.runId)}/${encodeURIComponent(
                      lead.candidateId
                    )}`}
                    target="_blank"
                  >
                    Export Handoff
                  </Link>
                  <Link
                    className="secondary-button"
                    href={`/api/handoffs/proxy-shape/${encodeURIComponent(report.runId)}/${encodeURIComponent(
                      lead.candidateId
                    )}`}
                    target="_blank"
                  >
                    Proxy Shape JSON
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Scout did not identify any shortlist candidates from this run.
          </p>
        )}
      </Panel>

      <Panel title="Lead Triage">
        <LeadTriagePanel items={leadTriageItems} runId={report.runId} />
      </Panel>

      <div id="outreach-workspace">
        <Panel
          title="Outreach Workspace"
          description="Desktop-first outreach grounded on the stored Scout run. Scout can inspect contact paths, recommend the best first channel, and help draft email, short-form, and phone-ready follow-up without turning the product into an automation system."
        >
          <OutreachWorkspace
            aiAvailable={outreach.aiAvailable}
            defaultLength={outreach.defaultLength}
            defaultTone={outreach.defaultTone}
            initialDrafts={outreach.drafts}
            leads={report.shortlist}
            runId={report.runId}
            {...(outreach.model ? { model: outreach.model } : {})}
          />
        </Panel>
      </div>

      <BusinessBreakdownsPanel
        candidatesById={candidatesById}
        findingsByCandidate={findingsByCandidate}
        report={report}
      />
    </div>
  );
}
