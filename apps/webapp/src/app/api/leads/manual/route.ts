import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createManualLeadRequestSchema,
  createManualLeadResponseSchema
} from "@scout/api-contracts";

import { createManualLead } from "@/lib/server/leads/manual-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = createManualLeadRequestSchema.parse(await request.json());
    const result = await createManualLead(input);

    return NextResponse.json(createManualLeadResponseSchema.parse(result));
  } catch (error) {
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof Error && error.message === "Scout run not found."
          ? 404
          : 422;

    return NextResponse.json(
      createManualLeadResponseSchema.partial({ runId: true, candidateId: true }).parse({
        errorMessage:
          error instanceof ZodError
            ? error.issues.map((issue) => issue.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to create manual lead."
      }),
      { status }
    );
  }
}
