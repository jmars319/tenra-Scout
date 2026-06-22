import Link from "next/link";

import type { LeadOpportunity, OutreachLength, OutreachTone } from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  buildEmptyEditor,
  buildMailtoHref,
  describeLeadCardSummary,
  hasPhoneNotes,
  humanize,
  resolveBusyMessage,
  resolveRecommendedChannel,
  type BusyState,
  type DraftEditorState,
  type DraftMessage
} from "./OutreachWorkspace.helpers";

export function OutreachLeadCard({
  aiAvailable,
  busyByCandidate,
  defaultLength,
  defaultTone,
  editors,
  expandedCandidateId,
  handleAnalyze,
  handleCopyEmail,
  handleCopyPhoneTalkingPoints,
  handleCopyShortMessage,
  handleGenerate,
  handleSave,
  lead,
  messageByCandidate,
  setExpandedCandidateId,
  updateEditor
}: {
  aiAvailable: boolean;
  busyByCandidate: Record<string, BusyState>;
  defaultLength: OutreachLength;
  defaultTone: OutreachTone;
  editors: Record<string, DraftEditorState>;
  expandedCandidateId: string | null;
  handleAnalyze: (candidateId: string) => Promise<void>;
  handleCopyEmail: (candidateId: string) => Promise<void>;
  handleCopyPhoneTalkingPoints: (candidateId: string) => Promise<void>;
  handleCopyShortMessage: (candidateId: string) => Promise<void>;
  handleGenerate: (candidateId: string) => Promise<void>;
  handleSave: (candidateId: string) => Promise<void>;
  lead: LeadOpportunity;
  messageByCandidate: Record<string, DraftMessage>;
  setExpandedCandidateId: (apply: (current: string | null) => string | null) => void;
  updateEditor: (candidateId: string, apply: (current: DraftEditorState) => DraftEditorState) => void;
}) {
  const editor = editors[lead.candidateId] ?? buildEmptyEditor(lead, defaultTone, defaultLength);
  const busyState = busyByCandidate[lead.candidateId];
  const message = messageByCandidate[lead.candidateId];
  const busyMessage = resolveBusyMessage(busyState);
  const recommendedChannel = resolveRecommendedChannel(editor);
  const mailtoHref = buildMailtoHref(editor);
  const contactFormUrl = editor.contactChannels.find((channel) => channel.kind === "contact_form")?.url;
  const isExpanded = expandedCandidateId === lead.candidateId;
  const cardSummary = describeLeadCardSummary(lead, editor);
  const hasEmailDraft = editor.subjectLine.trim().length > 0 && editor.body.trim().length > 0;
  const hasShortMessage = editor.shortMessage.trim().length > 0;
  const hasPhoneTalkingPoints = hasPhoneNotes(editor);
  const canSave =
    editor.contactChannels.length > 0 ||
    editor.contactRationale.length > 0 ||
    editor.subjectLine.trim().length > 0 ||
    editor.body.trim().length > 0 ||
    hasShortMessage ||
    hasPhoneTalkingPoints;

  /* Outreach card layout */

  return (
            <li
              key={lead.candidateId}
              className={`report-card outreach-card ${isExpanded ? "expanded" : "collapsed"}`}
            >
              <div className="outreach-card-head">
                <div className="outreach-card-main">
                  <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{lead.businessName}</div>
                  <Link className="inline-link" href={lead.primaryUrl} target="_blank">
                    {lead.primaryUrl}
                  </Link>
                  <div className="muted outreach-card-summary">{cardSummary}</div>
                </div>
                <div className="outreach-card-side">
                  <div className="tag-row">
                    <Tag tone="warn">{aiAvailable ? "Outreach Ready" : "Manual Draft"}</Tag>
                    <Tag>{humanize(lead.presenceQuality)}</Tag>
                    {recommendedChannel ? (
                      <Tag tone="good">Best fit: {recommendedChannel.label}</Tag>
                    ) : null}
                  </div>
                  <button
                    aria-expanded={isExpanded}
                    className="secondary-button outreach-card-toggle"
                    onClick={() =>
                      setExpandedCandidateId((current) =>
                        current === lead.candidateId ? null : lead.candidateId
                      )
                    }
                    type="button"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="outreach-card-body">
                  <div className="tag-row">
                    {(["calm", "direct", "friendly"] as OutreachTone[]).map((tone) => (
                      <button
                        key={tone}
                        className={`pill-button ${editor.tone === tone ? "active" : ""}`}
                        onClick={() =>
                          updateEditor(lead.candidateId, (current) => ({ ...current, tone }))
                        }
                        type="button"
                      >
                        {humanize(tone)}
                      </button>
                    ))}
                  </div>

                  <div className="tag-row">
                    {(["brief", "standard"] as OutreachLength[]).map((length) => (
                      <button
                        key={length}
                        className={`pill-button ${editor.length === length ? "active" : ""}`}
                        onClick={() =>
                          updateEditor(lead.candidateId, (current) => ({ ...current, length }))
                        }
                        type="button"
                      >
                        {humanize(length)}
                      </button>
                    ))}
                  </div>

                  <div className="outreach-toolbar">
                    <button
                      className="secondary-button"
                      disabled={busyState === "analyze"}
                      onClick={() => void handleAnalyze(lead.candidateId)}
                      type="button"
                    >
                      {busyState === "analyze" ? "Analyzing..." : "Analyze Contact Fit"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!aiAvailable || busyState === "generate"}
                      onClick={() => void handleGenerate(lead.candidateId)}
                      type="button"
                    >
                      {busyState === "generate"
                        ? "Generating..."
                        : hasEmailDraft || hasShortMessage || hasPhoneTalkingPoints
                          ? "Regenerate Pack"
                          : "Generate Outreach Pack"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!canSave || busyState === "save"}
                      onClick={() => void handleSave(lead.candidateId)}
                      type="button"
                    >
                      {busyState === "save" ? "Saving..." : "Save Local Pack"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!hasEmailDraft}
                      onClick={() => void handleCopyEmail(lead.candidateId)}
                      type="button"
                    >
                      Copy Email
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!hasShortMessage}
                      onClick={() => void handleCopyShortMessage(lead.candidateId)}
                      type="button"
                    >
                      Copy Short Version
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!hasPhoneTalkingPoints}
                      onClick={() => void handleCopyPhoneTalkingPoints(lead.candidateId)}
                      type="button"
                    >
                      Copy Phone Notes
                    </button>
                    {mailtoHref ? (
                      <a className="secondary-button" href={mailtoHref}>
                        Open Email
                      </a>
                    ) : null}
                    {contactFormUrl ? (
                      <a className="secondary-button" href={contactFormUrl} target="_blank" rel="noreferrer">
                        Open Contact Form
                      </a>
                    ) : null}
                  </div>

                  {busyMessage ? <div className="status-note neutral">{busyMessage}</div> : null}

                  {/* Contact fit boundary */}
                  <div className="section-stack">
                    <div className="section-label">Contact Fit</div>
                    {editor.contactChannels.length > 0 ? (
                      <>
                        <div className="tag-row">
                          {editor.contactChannels.map((channel) => (
                            <Tag
                              key={`${channel.kind}:${channel.url ?? channel.value ?? channel.label}`}
                              tone={
                                channel.kind === recommendedChannel?.kind &&
                                channel.url === recommendedChannel?.url
                                  ? "good"
                                  : "neutral"
                              }
                            >
                              {channel.label}
                            </Tag>
                          ))}
                        </div>
                        <ul className="note-list">
                          {editor.contactRationale.map((reason, index) => (
                            <li key={`contact-rationale-${lead.candidateId}-${index}`}>{reason}</li>
                          ))}
                        </ul>
	                        <ul className="note-list">
	                          {editor.contactChannels.map((channel) => (
	                            <li
	                              key={`detail-${channel.kind}:${channel.url ?? channel.value ?? channel.label}`}
	                            >
	                              <strong>{channel.label}.</strong> {channel.reason}{" "}
	                              {channel.value ? <span>{channel.value}</span> : null}{" "}
	                              {channel.url ? (
	                                <a
	                                  className="inline-link"
	                                  href={channel.url}
	                                  target="_blank"
	                                  rel="noreferrer"
	                                >
	                                  Open
	                                </a>
	                              ) : null}
	                            </li>
	                          ))}
	                        </ul>
	                      </>
	                    ) : (
	                      <p className="muted" style={{ margin: 0 }}>
	                        Analyze this lead to let Scout inspect the site and suggest the strongest
	                        first contact path.
	                      </p>
	                    )}
	                  </div>

	                  <div className="field-stack">
	                    <label className="section-label" htmlFor={`subject-${lead.candidateId}`}>
	                      Email Subject
	                    </label>
	                    <input
	                      className="draft-input"
	                      id={`subject-${lead.candidateId}`}
	                      onChange={(event) =>
	                        updateEditor(lead.candidateId, (current) => ({
	                          ...current,
	                          subjectLine: event.target.value
	                        }))
	                      }
	                      placeholder="Subject line"
	                      value={editor.subjectLine}
	                    />
	                  </div>

	                  <div className="field-stack">
	                    <label className="section-label" htmlFor={`body-${lead.candidateId}`}>
	                      Email Draft
	                    </label>
	                    <textarea
	                      className="draft-textarea"
	                      id={`body-${lead.candidateId}`}
	                      onChange={(event) =>
	                        updateEditor(lead.candidateId, (current) => ({
	                          ...current,
	                          body: event.target.value
	                        }))
	                      }
	                      placeholder="Full outreach email"
	                      value={editor.body}
	                    />
	                  </div>

	                  <div className="field-stack">
	                    <label className="section-label" htmlFor={`short-${lead.candidateId}`}>
	                      Short Version
	                    </label>
	                    <textarea
	                      className="draft-textarea"
	                      id={`short-${lead.candidateId}`}
	                      onChange={(event) =>
	                        updateEditor(lead.candidateId, (current) => ({
	                          ...current,
	                          shortMessage: event.target.value
	                        }))
	                      }
	                      placeholder="Short message for a contact form, social DM, or concise follow-up"
	                      style={{ minHeight: "7rem" }}
	                      value={editor.shortMessage}
	                    />
	                  </div>

	                  <div className="section-stack">
	                    <div className="section-label">Phone Talking Points</div>
	                    <div className="field-stack">
	                      <label className="muted" htmlFor={`phone-opener-${lead.candidateId}`}>
	                        Opener
	                      </label>
	                      <textarea
	                        className="draft-textarea"
	                        id={`phone-opener-${lead.candidateId}`}
	                        onChange={(event) =>
	                          updateEditor(lead.candidateId, (current) => ({
	                            ...current,
	                            phoneTalkingPoints: {
	                              opener: event.target.value,
	                              keyPoints: current.phoneTalkingPoints?.keyPoints ?? [],
	                              close: current.phoneTalkingPoints?.close ?? ""
	                            }
	                          }))
	                        }
	                        placeholder="Short phone opener"
	                        style={{ minHeight: "5rem" }}
	                        value={editor.phoneTalkingPoints?.opener ?? ""}
	                      />
	                    </div>

	                    <div className="field-stack">
	                      <label className="muted" htmlFor={`phone-points-${lead.candidateId}`}>
	                        Key Points
	                      </label>
	                      <textarea
	                        className="draft-textarea"
	                        id={`phone-points-${lead.candidateId}`}
	                        onChange={(event) =>
	                          updateEditor(lead.candidateId, (current) => ({
	                            ...current,
	                            phoneTalkingPoints: {
	                              opener: current.phoneTalkingPoints?.opener ?? "",
	                              keyPoints: event.target.value
	                                .split("\n")
	                                .map((point) => point.trim())
	                                .filter(Boolean),
	                              close: current.phoneTalkingPoints?.close ?? ""
	                            }
	                          }))
	                        }
	                        placeholder="One point per line"
	                        style={{ minHeight: "7rem" }}
	                        value={(editor.phoneTalkingPoints?.keyPoints ?? []).join("\n")}
	                      />
	                    </div>

	                    <div className="field-stack">
	                      <label className="muted" htmlFor={`phone-close-${lead.candidateId}`}>
	                        Close
	                      </label>
	                      <textarea
	                        className="draft-textarea"
	                        id={`phone-close-${lead.candidateId}`}
	                        onChange={(event) =>
	                          updateEditor(lead.candidateId, (current) => ({
	                            ...current,
	                            phoneTalkingPoints: {
	                              opener: current.phoneTalkingPoints?.opener ?? "",
	                              keyPoints: current.phoneTalkingPoints?.keyPoints ?? [],
	                              close: event.target.value
	                            }
	                          }))
	                        }
	                        placeholder="Suggested close or next-step ask"
	                        style={{ minHeight: "5rem" }}
	                        value={editor.phoneTalkingPoints?.close ?? ""}
	                      />
	                    </div>
	                  </div>

	                  <div className="section-stack">
	                    <div className="section-label">Grounded From</div>
	                    <ul className="note-list">
	                      {editor.grounding.length > 0 ? (
	                        editor.grounding.map((reason, index) => (
	                          <li key={`grounding-${lead.candidateId}-${index}`}>{reason}</li>
	                        ))
	                      ) : (
	                        <li>
	                          Scout will attach grounded reasons after the first analysis, save, or
	                          generation.
	                        </li>
	                      )}
	                    </ul>
	                  </div>

	                  {editor.updatedAt ? (
	                    <div className="muted" style={{ fontSize: "0.9rem" }}>
	                      Last saved {new Date(editor.updatedAt).toLocaleString()}
	                    </div>
	                  ) : null}

	                  {!busyMessage && message?.text ? (
	                    <div className={`status-note ${message.tone}`}>{message.text}</div>
	                  ) : null}
	                </div>
	              ) : message?.text ? (
	                <div className={`status-note ${message.tone}`}>{message.text}</div>
	              ) : null}
	            </li>
  );
}
