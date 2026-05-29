"use client";

import { useEffect, useState } from "react";

import { Tag } from "@scout/ui";

type ReadinessStatus = "ready" | "warn" | "blocked";

interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  message: string;
  evidence?: Record<string, string | number | boolean | null>;
}

interface ReadinessReport {
  ok: boolean;
  checkedAt: string;
  checks: ReadinessCheck[];
}

const statusTone: Record<ReadinessStatus, "good" | "warn" | "danger"> = {
  ready: "good",
  warn: "warn",
  blocked: "danger"
};

async function fetchReadiness(): Promise<ReadinessReport> {
  const response = await fetch("/api/operator/readiness", {
    cache: "no-store"
  });
  const body = (await response.json()) as ReadinessReport;

  return body;
}

export function OperatorReadinessPanel() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      setReport(await fetchReadiness());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operator readiness could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetchReadiness()
      .then((nextReport) => {
        if (isMounted) {
          setReport(nextReport);
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Operator readiness could not be loaded.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="operator-readiness">
      <div className="lead-inbox-toolbar">
        <div>
          <div className="section-label">Operator Readiness</div>
          <div className="muted">
            {report ? `Checked ${new Date(report.checkedAt).toLocaleString()}` : "Checking local runtime"}
          </div>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void refresh()} type="button">
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {error ? <p className="status-note danger">{error}</p> : null}

      <div className="operator-readiness-grid">
        {(report?.checks ?? []).map((check) => (
          <div className="operator-readiness-card" key={check.id}>
            <div className="tag-row">
              <Tag tone={statusTone[check.status]}>{check.status}</Tag>
              <strong>{check.label}</strong>
            </div>
            <p className="muted">{check.message}</p>
            {check.evidence ? (
              <div className="operator-readiness-evidence">
                {Object.entries(check.evidence).map(([key, value]) => (
                  <span key={key}>
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {!report && loading ? <p className="muted">Checking Scout readiness...</p> : null}
    </div>
  );
}
