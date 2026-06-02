import type { LeadInboxItem, OutreachDraft, ScoutRunReport, SearchCandidate } from "@scout/domain";

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function buildLeadPackMarkdown(input: {
  item: LeadInboxItem;
  report: ScoutRunReport;
  draft?: OutreachDraft | undefined;
  candidate?: SearchCandidate | undefined;
  generatedAt: string;
}) {
  const { item, report, draft, candidate, generatedAt } = input;
  const findings = report.findings.filter((finding) => finding.candidateId === item.candidateId);
  const business = report.businessBreakdowns.find(
    (breakdown) => breakdown.candidateId === item.candidateId
  );
  const lines = [
    `# Scout Lead Pack: ${item.businessName}`,
    "",
    `Generated: ${generatedAt}`,
    `Run: ${item.runId}`,
    `Candidate: ${item.candidateId}`,
    `Market: ${item.marketTerm}`,
    `Query: ${item.rawQuery}`,
    `URL: ${item.primaryUrl || "None"}`,
    `Source: ${item.source ?? candidate?.source ?? "Unknown"}`,
    `Provenance: ${
      item.provenance
        ? humanize(item.provenance)
        : candidate?.provenance
          ? humanize(candidate.provenance)
          : "Unknown"
    }`,
    "",
    "## Completion",
    "",
    `- Lead state: ${humanize(item.annotation.state)}`,
    `- Outreach: ${humanize(item.outreach.status)}`,
    `- Proxy receipt: ${item.handoffHistory.some((entry) => entry.proxyReceipt) ? "Present" : "Missing"}`,
    `- Guardrail request: ${item.handoffHistory.some((entry) => entry.target === "guardrail") ? "Present" : "Missing"}`,
    `- Guardrail decision: ${item.handoffHistory.some((entry) => entry.mode === "decision-return") ? "Present" : "Missing"}`,
    "",
    "## Evidence",
    "",
    `- Presence: ${item.presenceType ? humanize(item.presenceType) : "Unknown"} / ${
      item.presenceQuality ? humanize(item.presenceQuality) : "Unknown"
    }`,
    `- Confidence: ${item.confidence ? humanize(item.confidence) : "Unknown"}`,
    `- Findings: ${item.findingCount} (${item.highSeverityFindings} high severity)`,
    `- Top issues: ${item.topIssues.length ? item.topIssues.map(humanize).join(", ") : "None"}`,
    "",
    "## Contact And Outreach",
    "",
    `- Recommended channel: ${
      item.outreach.recommendedChannelLabel ??
      (item.outreach.recommendedChannel ? humanize(item.outreach.recommendedChannel) : "None")
    }`,
    `- Next action: ${item.outreach.nextAction}`,
    `- Subject: ${draft?.subjectLine || "None"}`,
    `- Operator note: ${item.annotation.operatorNote || "None"}`
  ];

  if (item.provenanceNote || candidate?.provenanceNote) {
    lines.push("", "## Provenance", "", item.provenanceNote ?? candidate?.provenanceNote ?? "");
  }

  if (business?.detectionNotes.length) {
    lines.push("", "## Detection Notes", "", ...business.detectionNotes.map((note) => `- ${note}`));
  }

  if (findings.length) {
    lines.push(
      "",
      "## Findings",
      "",
      ...findings.map(
        (finding) =>
          `- ${humanize(finding.severity)} / ${humanize(finding.issueType)}: ${finding.message}`
      )
    );
  }

  if (draft?.body || draft?.shortMessage || draft?.phoneTalkingPoints) {
    lines.push("", "## Drafts", "");
    if (draft.body) {
      lines.push("### Email", "", draft.body, "");
    }
    if (draft.shortMessage) {
      lines.push("### Short Message", "", draft.shortMessage, "");
    }
    if (draft.phoneTalkingPoints) {
      lines.push(
        "### Phone",
        "",
        draft.phoneTalkingPoints.opener,
        ...draft.phoneTalkingPoints.keyPoints.map((point) => `- ${point}`),
        draft.phoneTalkingPoints.close
      );
    }
  }

  if (item.handoffHistory.length) {
    lines.push(
      "",
      "## Handoff History",
      "",
      ...item.handoffHistory.map(
        (entry) =>
          `- ${entry.exportedAt}: ${entry.target} / ${entry.mode} / ${entry.status} / ${entry.traceId}`
      )
    );
  }

  return lines.join("\n").trim();
}
