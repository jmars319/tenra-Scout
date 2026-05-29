"use client";

import { useState, type FormEvent } from "react";

import { createManualLeadResponseSchema } from "@scout/api-contracts";

interface ManualLeadEntryProps {
  defaultMarket?: string | undefined;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not create this manual lead.";
  } catch {
    return "Scout could not create this manual lead.";
  }
}

function optionalValue(formData: FormData, key: string): string | undefined {
  const rawValue = formData.get(key);
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  return value ? value : undefined;
}

export function ManualLeadEntry({ defaultMarket = "" }: ManualLeadEntryProps) {
  const [message, setMessage] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function submitManualLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    setPending(true);
    setMessage("Creating manual lead...");

    const formData = new FormData(event.currentTarget);
    const payload = {
      market: optionalValue(formData, "market"),
      query: optionalValue(formData, "query"),
      runId: optionalValue(formData, "runId"),
      businessName: optionalValue(formData, "businessName") ?? "",
      primaryUrl: optionalValue(formData, "primaryUrl") ?? "",
      notes: optionalValue(formData, "notes") ?? "",
      contactName: optionalValue(formData, "contactName"),
      contactEmail: optionalValue(formData, "contactEmail"),
      contactPhone: optionalValue(formData, "contactPhone")
    };

    const response = await fetch("/api/leads/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      setMessage(await readErrorMessage(response));
      setPending(false);
      return;
    }

    const body = createManualLeadResponseSchema.parse(await response.json());
    setMessage("Manual lead created. Opening lead detail...");
    window.location.href = `/leads/${encodeURIComponent(body.runId)}/${encodeURIComponent(body.candidateId)}`;
  }

  return (
    <form
      className="manual-lead-entry"
      onSubmit={(event) => {
        void submitManualLead(event);
      }}
    >
      <div>
        <h2>Manual Lead</h2>
        <p className="muted">
          Add one operator-entered lead when live acquisition is weak or a known business is missing.
        </p>
      </div>
      <div className="manual-lead-grid">
        <label className="field-stack">
          <span className="section-label">Market</span>
          <input className="draft-input" defaultValue={defaultMarket} name="market" placeholder="roofers in Midway, KY" />
        </label>
        <label className="field-stack">
          <span className="section-label">Existing run id</span>
          <input className="draft-input" name="runId" placeholder="Optional" />
        </label>
        <label className="field-stack">
          <span className="section-label">Business</span>
          <input className="draft-input" name="businessName" required placeholder="Business name" />
        </label>
        <label className="field-stack">
          <span className="section-label">Primary URL</span>
          <input className="draft-input" name="primaryUrl" required placeholder="https://example.com" />
        </label>
        <label className="field-stack">
          <span className="section-label">Contact name</span>
          <input className="draft-input" name="contactName" placeholder="Optional" />
        </label>
        <label className="field-stack">
          <span className="section-label">Contact email</span>
          <input className="draft-input" name="contactEmail" placeholder="Optional" type="email" />
        </label>
        <label className="field-stack">
          <span className="section-label">Contact phone</span>
          <input className="draft-input" name="contactPhone" placeholder="Optional" />
        </label>
        <label className="field-stack manual-lead-notes">
          <span className="section-label">Notes</span>
          <textarea className="draft-textarea" name="notes" placeholder="Why this lead belongs in Scout" />
        </label>
      </div>
      <div className="manual-lead-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Creating..." : "Add manual lead"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
