import Link from "next/link";

import type { ScoutRunReport } from "@scout/domain";
import { Panel, Tag } from "@scout/ui";

import {
  buildListKey,
  describeCandidateProvenance,
  formatSignedDelta,
  humanize,
  sortFindings,
  toneForAuditStatus,
  toneForConfidence,
  toneForCountDelta,
  toneForFindingDelta,
  toneForQuality,
  toneForSeverity
} from "./ReportView.helpers";
import type { MarketComparison } from "@/lib/server/market-comparison";
import { describeSampleQuality, toneForSampleQuality } from "./sample-quality-copy";

/* Market comparison boundary */

export function MarketComparisonPanel({ marketComparison }: { marketComparison?: MarketComparison | null | undefined }) {
  if (!marketComparison) {
    return null;
  }

  return (
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
  );
}

/* Business breakdown boundary */

export function BusinessBreakdownsPanel({
  candidatesById,
  findingsByCandidate,
  report
}: {
  candidatesById: Map<string, ScoutRunReport["candidates"][number]>;
  findingsByCandidate: Map<string, ScoutRunReport["findings"]>;
  report: ScoutRunReport;
}) {
  return (
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
  );
}
