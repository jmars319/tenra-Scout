"use client";

import Link from "next/link";
import { useState } from "react";

import { outreachDraftResponseSchema } from "@scout/api-contracts";
import type {
  LeadOpportunity,
  OutreachDraft,
  OutreachLength,
  OutreachTone
} from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  buildEmptyEditor,
  buildInitialEditors,
  buildMailtoHref,
  describeLeadCardSummary,
  draftToEditor,
  formatPhoneTalkingPoints,
  hasPhoneNotes,
  humanize,
  normalizePhoneTalkingPoints,
  resolveBusyMessage,
  resolveRecommendedChannel,
  type BusyState,
  type DraftEditorState,
  type DraftMessage
} from "./OutreachWorkspace.helpers";

interface OutreachWorkspaceProps {
  runId: string;
  leads: LeadOpportunity[];
  initialDrafts: OutreachDraft[];
  aiAvailable: boolean;
  defaultTone: OutreachTone;
  defaultLength: OutreachLength;
  model?: string | undefined;
}

export function OutreachWorkspace({
  runId,
  leads,
  initialDrafts,
  aiAvailable,
  defaultTone,
  defaultLength,
  model
}: OutreachWorkspaceProps) {
  const [editors, setEditors] = useState<Record<string, DraftEditorState>>(() =>
    buildInitialEditors(leads, initialDrafts, defaultTone, defaultLength)
  );
  const [busyByCandidate, setBusyByCandidate] = useState<Record<string, BusyState>>({});
  const [messageByCandidate, setMessageByCandidate] = useState<Record<string, DraftMessage>>({});
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(
    () => leads[0]?.candidateId ?? null
  );

  function updateEditor(
    candidateId: string,
    apply: (current: DraftEditorState) => DraftEditorState
  ) {
    setEditors((current) => {
      const existing = current[candidateId];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [candidateId]: apply(existing)
      };
    });
  }

  function applySavedDraft(candidateId: string, lead: LeadOpportunity, draft: OutreachDraft) {
    setEditors((current) => ({
      ...current,
      [candidateId]: draftToEditor(draft, lead.reasons.slice(0, 4))
    }));
  }

  async function handleAnalyze(candidateId: string) {
    const lead = leads.find((item) => item.candidateId === candidateId);
    if (!lead) {
      return;
    }

    setExpandedCandidateId(candidateId);
    setBusyByCandidate((current) => ({ ...current, [candidateId]: "analyze" }));
    setMessageByCandidate((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });

    try {
      const response = await fetch(`/api/runs/${runId}/outreach/${candidateId}`, {
        method: "POST"
      });
      const payload = outreachDraftResponseSchema.parse(await response.json());
      const draft = payload.draft;

      if (!response.ok || !draft) {
        throw new Error(payload.errorMessage || "Scout could not analyze contact fit.");
      }

      applySavedDraft(candidateId, lead, draft);
      const recommendedChannel =
        draft.contactChannels.find((channel) => channel.kind === draft.recommendedChannel) ??
        draft.contactChannels[0];

      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: recommendedChannel
            ? `Contact fit refreshed. Best first path: ${recommendedChannel.label}.`
            : "Contact fit refreshed, but Scout still could not find a direct channel.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Unknown contact analysis failure.",
          tone: "danger"
        }
      }));
    } finally {
      setBusyByCandidate((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
  }

  async function handleGenerate(candidateId: string) {
    const lead = leads.find((item) => item.candidateId === candidateId);
    const editor = editors[candidateId];

    if (!lead || !editor) {
      return;
    }

    setExpandedCandidateId(candidateId);
    setBusyByCandidate((current) => ({ ...current, [candidateId]: "generate" }));
    setMessageByCandidate((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });

    try {
      const response = await fetch(`/api/runs/${runId}/outreach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          candidateId,
          tone: editor.tone,
          length: editor.length
        })
      });
      const payload = outreachDraftResponseSchema.parse(await response.json());
      const draft = payload.draft;

      if (!response.ok || !draft) {
        throw new Error(payload.errorMessage || "Scout could not generate the outreach pack.");
      }

      applySavedDraft(candidateId, lead, draft);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: model ? `Outreach pack refreshed with ${model}.` : "Outreach pack refreshed.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Unknown outreach generation failure.",
          tone: "danger"
        }
      }));
    } finally {
      setBusyByCandidate((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
  }

  async function handleSave(candidateId: string) {
    const lead = leads.find((item) => item.candidateId === candidateId);
    const editor = editors[candidateId];

    if (!lead || !editor) {
      return;
    }

    setExpandedCandidateId(candidateId);
    setBusyByCandidate((current) => ({ ...current, [candidateId]: "save" }));
    setMessageByCandidate((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });

    try {
      const response = await fetch(`/api/runs/${runId}/outreach/${candidateId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tone: editor.tone,
          length: editor.length,
          subjectLine: editor.subjectLine,
          body: editor.body,
          shortMessage: editor.shortMessage,
          phoneTalkingPoints: normalizePhoneTalkingPoints(editor.phoneTalkingPoints)
        })
      });
      const payload = outreachDraftResponseSchema.parse(await response.json());
      const draft = payload.draft;

      if (!response.ok || !draft) {
        throw new Error(payload.errorMessage || "Scout could not save the outreach pack.");
      }

      applySavedDraft(candidateId, lead, draft);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Outreach pack saved locally.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Unknown outreach save failure.",
          tone: "danger"
        }
      }));
    } finally {
      setBusyByCandidate((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
  }

  async function handleCopyEmail(candidateId: string) {
    const editor = editors[candidateId];
    if (!editor?.subjectLine.trim() || !editor.body.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(`Subject: ${editor.subjectLine}\n\n${editor.body}`);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Email draft copied to clipboard.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Clipboard copy failed.",
          tone: "danger"
        }
      }));
    }
  }

  async function handleCopyShortMessage(candidateId: string) {
    const editor = editors[candidateId];
    if (!editor?.shortMessage.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(editor.shortMessage);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Short-form outreach copied to clipboard.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Clipboard copy failed.",
          tone: "danger"
        }
      }));
    }
  }

  async function handleCopyPhoneTalkingPoints(candidateId: string) {
    const editor = editors[candidateId];
    const phoneText = formatPhoneTalkingPoints(editor?.phoneTalkingPoints);

    if (!phoneText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(phoneText);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Phone talking points copied to clipboard.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Clipboard copy failed.",
          tone: "danger"
        }
      }));
    }
  }

  if (leads.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Scout did not identify any shortlist candidates to draft outreach for.
      </p>
    );
  }

  return (
    <div className="outreach-stack">
      <div className="outreach-banner">
        <div>
          <strong>Desktop-first local outreach.</strong>{" "}
          Scout can inspect contact paths, recommend the best first channel, and save an email,
          short-form version, and phone talking points with this run on your machine.
          </div>
        <div className="tag-row">
          <Tag tone={aiAvailable ? "good" : "warn"}>
            {aiAvailable ? "Draft Engine Ready" : "Draft Engine Disabled"}
          </Tag>
          <Tag>{model ?? "Manual editing only"}</Tag>
        </div>
      </div>

      {!aiAvailable ? (
        <p className="muted" style={{ margin: 0 }}>
          Enable a local template, local Ollama, or OpenAI outreach provider to generate the full
          outreach pack automatically. Contact analysis and manual edits can still be saved locally.
        </p>
      ) : null}

      <ul className="shortlist">
        {leads.map((lead) => {
          const editor =
            editors[lead.candidateId] ?? buildEmptyEditor(lead, defaultTone, defaultLength);
          const busyState = busyByCandidate[lead.candidateId];
          const message = messageByCandidate[lead.candidateId];
          const busyMessage = resolveBusyMessage(busyState);
          const recommendedChannel = resolveRecommendedChannel(editor);
          const mailtoHref = buildMailtoHref(editor);
          const contactFormUrl = editor.contactChannels.find(
            (channel) => channel.kind === "contact_form"
          )?.url;
          const isExpanded = expandedCandidateId === lead.candidateId;
          const cardSummary = describeLeadCardSummary(lead, editor);
          const hasEmailDraft =
            editor.subjectLine.trim().length > 0 && editor.body.trim().length > 0;
          const hasShortMessage = editor.shortMessage.trim().length > 0;
          const hasPhoneTalkingPoints = hasPhoneNotes(editor);
          const canSave =
            editor.contactChannels.length > 0 ||
            editor.contactRationale.length > 0 ||
            editor.subjectLine.trim().length > 0 ||
            editor.body.trim().length > 0 ||
            hasShortMessage ||
            hasPhoneTalkingPoints;

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
        })}
      </ul>
    </div>
  );
}
