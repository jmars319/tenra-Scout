import { NextResponse } from "next/server";

import {
  buildLeadPackExport,
  type LeadPackExportFormat
} from "@/lib/server/leads/lead-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveFormat(request: Request): LeadPackExportFormat {
  const format = new URL(request.url).searchParams.get("format");
  return format === "json" ? "json" : "markdown";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await context.params;

  try {
    const exportFile = await buildLeadPackExport({
      runId,
      candidateId,
      format: resolveFormat(request)
    });

    return new NextResponse(exportFile.body, {
      headers: {
        "content-type": exportFile.contentType,
        "content-disposition": `attachment; filename="${exportFile.filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export Scout lead pack.";

    return NextResponse.json(
      {
        errorMessage: message
      },
      {
        status: message === "Scout run not found." || message === "Scout lead not found." ? 404 : 422
      }
    );
  }
}
