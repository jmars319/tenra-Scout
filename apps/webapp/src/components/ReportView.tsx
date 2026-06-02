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
  formatSignedDelta,
  groupFindings,
  humanize,
  sortFindings,
  toneForAcquisitionTrust,
  toneForAuditStatus,
  toneForConfidence,
  toneForCountDelta,
  toneForFindingDelta,
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

      {marketComparison ? (
        <Panel
          title="Market Comparison"
          description={`Compared with ${new Date(
            marketComparison.previousRunAt
          ).toLocaleString()} for the same saved market query.`}
        >
          <div className="tag-row" style={{ marginBottom: "1rem" }}>
            <Tag tone={toneForSampleQuality(marketComparison.previousSampleQuality)}>
              Previous {describeSampleQuality(marketComparison.previousSampleQuality)}
            </Tag>
            <Tag tone={toneForSampleQuality(marketComparison.currentSampleQuality)}>
              Current {describeSampleQuality(marketComparison.currentSampleQuality)}
            </Tag>
            <Link className="inline-link" href={`/runs/${marketComparison.previousRunId}`}>
              Previous run
            </Link>
          </div>

          <div className="sample-decision-grid comparison-metric-grid">
            <div className="sample-decision-row">
              <span>Candidates</span>
              <Tag tone={toneForCountDelta(marketComparison.candidateCountDelta)}>
                {formatSignedDelta(marketComparison.candidateCountDelta)}
              </Tag>
            </div>
            <div className="sample-decision-row">
              <span>Shortlist</span>
              <Tag tone={toneForCountDelta(marketComparison.shortlistCountDelta)}>
                {formatSignedDelta(marketComparison.shortlistCountDelta)}
              </Tag>
            </div>
            <div className="sample-decision-row">
              <span>Findings</span>
              <Tag tone={toneForFindingDelta(marketComparison.findingCountDelta)}>
                {formatSignedDelta(marketComparison.findingCountDelta)}
              </Tag>
            </div>
            <div className="sample-decision-row">
              <span>High Severity</span>
              <Tag tone={toneForFindingDelta(marketComparison.highSeverityFindingDelta)}>
                {formatSignedDelta(marketComparison.highSeverityFindingDelta)}
              </Tag>
            </div>
          </div>

          <div className="scout-grid two-up" style={{ marginTop: "1rem" }}>
            <div>
              <div className="section-label">New Businesses</div>
              {marketComparison.newBusinesses.length > 0 ? (
                <ul className="note-list">
                  {marketComparison.newBusinesses.map((business) => (
                    <li key={`new-${business.primaryUrl}`}>
                      <Link className="inline-link" href={business.primaryUrl} target="_blank">
                        {business.businessName}
                      </Link>
                      {business.shortlistRank ? ` / shortlist #${business.shortlistRank}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No new kept businesses compared with the previous scan.
                </p>
              )}
            </div>

            <div>
              <div className="section-label">Missing Businesses</div>
              {marketComparison.missingBusinesses.length > 0 ? (
                <ul className="note-list">
                  {marketComparison.missingBusinesses.map((business) => (
                    <li key={`missing-${business.primaryUrl}`}>
                      <Link className="inline-link" href={business.primaryUrl} target="_blank">
                        {business.businessName}
                      </Link>
                      {business.shortlistRank ? ` / was shortlist #${business.shortlistRank}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No previously kept businesses disappeared from this scan.
                </p>
              )}
            </div>
          </div>

          {marketComparison.rankChanges.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Shortlist Movement</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Move</th>
                  </tr>
                </thead>
                <tbody>
                  {marketComparison.rankChanges.map((change) => (
                    <tr key={`rank-${change.primaryUrl}`}>
                      <td>{change.businessName}</td>
                      <td>#{change.previousRank}</td>
                      <td>#{change.currentRank}</td>
                      <td>
                        <Tag tone={change.delta > 0 ? "good" : "warn"}>
                          {change.delta > 0 ? `Up ${change.delta}` : `Down ${Math.abs(change.delta)}`}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {marketComparison.findingChanges.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Finding Changes</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Findings</th>
                    <th>High Severity</th>
                    <th>Current Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {marketComparison.findingChanges.map((change) => (
                    <tr key={`findings-${change.primaryUrl}`}>
                      <td>{change.businessName}</td>
                      <td>
                        <Tag tone={toneForFindingDelta(change.findingDelta)}>
                          {change.previousFindingCount} to {change.currentFindingCount}
                        </Tag>
                      </td>
                      <td>
                        <Tag tone={toneForFindingDelta(change.highSeverityDelta)}>
                          {change.previousHighSeverityFindings} to {change.currentHighSeverityFindings}
                        </Tag>
                      </td>
                      <td>
                        {change.currentTopIssues.length > 0
                          ? change.currentTopIssues.map(humanize).join(", ")
                          : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {marketComparison.issueChanges.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Issue Mix Changes</div>
              <div className="tag-row">
                {marketComparison.issueChanges.map((change) => (
                  <Tag key={change.issueType} tone={toneForFindingDelta(change.delta)}>
                    {humanize(change.issueType)} {formatSignedDelta(change.delta)}
                  </Tag>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

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

      <Panel
        title="Business Breakdowns"
        description="Every candidate kept in the run, including social, directory, marketplace, blocked, and dead presences."
      >
        <ul className="report-list">
          {report.businessBreakdowns.map((business) => {
            const candidateFindings = sortFindings(
              findingsByCandidate.get(business.candidateId) ?? []
            );
            const evidence = candidateFindings.filter((finding) => finding.screenshotUrl).slice(0, 2);
            const candidate = candidatesById.get(business.candidateId);

            return (
              <li key={business.candidateId} className="report-card">
                <header>
                  <div>
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{business.businessName}</div>
                    <Link className="inline-link" href={business.primaryUrl} target="_blank">
                      {business.primaryUrl}
                    </Link>
                  </div>
                  <div className="tag-row">
                    <Tag>Rank {business.searchRank}</Tag>
                    <Tag>{humanize(business.presenceType)}</Tag>
                    <Tag tone={toneForQuality(business.presenceQuality)}>
                      {humanize(business.presenceQuality)}
                    </Tag>
                    <Tag tone={toneForConfidence(business.confidence)}>
                      {humanize(business.confidence)}
                    </Tag>
                    <Tag tone={toneForAuditStatus(business.auditStatus)}>
                      {humanize(business.auditStatus)}
                    </Tag>
                    <Tag>{describeCandidateProvenance(candidate?.provenance)}</Tag>
                  </div>
                </header>

                {candidate?.provenanceNote ? (
                  <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
                    {candidate.provenanceNote}
                  </p>
                ) : null}

                <div className="tag-row">
                  <Tag>{business.findingCount} finding(s)</Tag>
                  {business.highSeverityFindings > 0 ? (
                    <Tag tone="danger">
                      {business.highSeverityFindings} high severity
                    </Tag>
                  ) : null}
                  {business.opportunityTypes.map((opportunity) => (
                    <Tag key={opportunity} tone="good">
                      {humanize(opportunity)}
                    </Tag>
                  ))}
                </div>

                {business.topIssues.length > 0 ? (
                  <div className="tag-row">
                    {business.topIssues.map((issue) => (
                      <Tag key={issue} tone="warn">
                        {humanize(issue)}
                      </Tag>
                    ))}
                  </div>
                ) : null}

                {business.secondaryUrls.length > 0 ? (
                  <div className="section-stack">
                    <div className="section-label">Reviewed Pages</div>
                    <ul className="note-list">
                      <li>Homepage: {business.primaryUrl}</li>
                      {business.secondaryUrls.map((url, index) => (
                        <li key={buildListKey(`secondary-url-${business.candidateId}`, index)}>
                          Secondary: {url}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {business.detectionNotes.length > 0 ? (
                  <div className="section-stack">
                    <div className="section-label">
                      {business.auditStatus === "audited" ? "Detection Notes" : "Skipped Notes"}
                    </div>
                    <ul className="note-list">
                      {business.detectionNotes.map((note, index) => (
                        <li key={buildListKey(`detection-note-${business.candidateId}`, index)}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {evidence.length > 0 ? (
                  <div className="evidence-grid">
                    {evidence.map((finding) => (
                      <div key={finding.id} className="evidence-card">
                        <img alt={finding.message} src={finding.screenshotUrl} />
                        <div className="muted" style={{ fontSize: "0.9rem" }}>
                          {humanize(finding.pageLabel)} · {humanize(finding.viewport)} ·{" "}
                          {humanize(finding.issueType)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <details>
                  <summary>
                    {business.auditStatus === "audited"
                      ? `Evidence and findings (${candidateFindings.length})`
                      : "Audit details"}
                  </summary>

                  {candidateFindings.length > 0 ? (
                    <table className="finding-table">
                      <thead>
                        <tr>
                          <th>Issue</th>
                          <th>Severity</th>
                          <th>Confidence</th>
                          <th>Viewport</th>
                          <th>Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateFindings.map((finding) => (
                          <tr key={finding.id}>
                            <td>
                              <div>{finding.message}</div>
                              <div className="muted" style={{ marginTop: "0.25rem" }}>
                                {finding.reproductionNote}
                              </div>
                            </td>
                            <td>
                              <Tag tone={toneForSeverity(finding.severity)}>
                                {humanize(finding.severity)}
                              </Tag>
                            </td>
                            <td>
                              <Tag tone={toneForConfidence(finding.confidence)}>
                                {humanize(finding.confidence)}
                              </Tag>
                            </td>
                            <td>{humanize(finding.viewport)}</td>
                            <td>
                              <div>{humanize(finding.pageLabel)}</div>
                              <div className="muted" style={{ marginTop: "0.25rem" }}>
                                {finding.pageUrl}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted" style={{ marginBottom: 0 }}>
                      {business.auditStatus === "audited"
                        ? "No audit findings were attached to this candidate."
                        : "This candidate was preserved in the market scan but skipped from site audit."}
                    </p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>

      {report.notes.length > 0 ? (
        <Panel title="Run Notes">
          <ul className="note-list">
            {report.notes.map((note, index) => (
              <li key={buildListKey("run-note", index)}>{note}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
