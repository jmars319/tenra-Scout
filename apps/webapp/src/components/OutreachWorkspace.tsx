"use client";

import { useState } from "react";

import { outreachDraftResponseSchema } from "@scout/api-contracts";
import type {
  LeadOpportunity,
  OutreachDraft,
  OutreachLength,
  OutreachTone
} from "@scout/domain";
import { Tag } from "@scout/ui";

import { OutreachLeadCard } from "./OutreachLeadCard";

import {
  buildInitialEditors,
  draftToEditor,
  formatPhoneTalkingPoints,
  normalizePhoneTalkingPoints,
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
        {leads.map((lead) => (
          <OutreachLeadCard
            aiAvailable={aiAvailable}
            busyByCandidate={busyByCandidate}
            defaultLength={defaultLength}
            defaultTone={defaultTone}
            editors={editors}
            expandedCandidateId={expandedCandidateId}
            handleAnalyze={handleAnalyze}
            handleCopyEmail={handleCopyEmail}
            handleCopyPhoneTalkingPoints={handleCopyPhoneTalkingPoints}
            handleCopyShortMessage={handleCopyShortMessage}
            handleGenerate={handleGenerate}
            handleSave={handleSave}
            key={lead.candidateId}
            lead={lead}
            messageByCandidate={messageByCandidate}
            setExpandedCandidateId={setExpandedCandidateId}
            updateEditor={updateEditor}
          />
        ))}
      </ul>
    </div>
  );
}
