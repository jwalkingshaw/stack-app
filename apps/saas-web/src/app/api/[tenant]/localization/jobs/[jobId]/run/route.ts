import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../../../_shared";
import { executeLocalizationJobById } from "../../route";

const RUNNABLE_STATUSES = new Set(["queued", "running", "review_required"]);

// POST /api/[tenant]/localization/jobs/[jobId]/run
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const { data: job, error: jobError } = await (supabaseServer as any)
      .from("translation_jobs")
      .select("id,status")
      .eq("organization_id", organization.id)
      .eq("id", resolved.jobId)
      .maybeSingle();

    if (jobError) {
      if (isMissingLocalizationFoundationError(jobError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load localization job for run:", jobError);
      return NextResponse.json({ error: "Failed to execute localization job" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Localization job not found" }, { status: 404 });
    }

    if (!RUNNABLE_STATUSES.has(String(job.status || ""))) {
      return NextResponse.json(
        { error: `Job cannot be executed from status '${job.status}'.` },
        { status: 409 }
      );
    }

    const result = await executeLocalizationJobById({
      organizationId: organization.id,
      jobId: resolved.jobId,
    });

    return NextResponse.json({
      success: true,
      data: {
        jobId: resolved.jobId,
        status: result.status,
        estimatedChars: result.estimatedChars,
        actualChars: result.actualChars,
        generatedItems: result.generatedItems,
        failedItems: result.failedItems,
      },
    });
  } catch (error) {
    console.error("Error in localization job run POST:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message.toLowerCase().includes("not found")
        ? 404
        : message.toLowerCase().includes("starter")
          ? 403
          : message.toLowerCase().includes("quota")
            ? 402
            : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
