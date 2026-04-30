import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../../../_shared";
import { POST as createLocalizationJob } from "../../route";

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
    const { data: job, error: jobError } = await getSupabaseServer()
      .from("translation_jobs")
      .select(
        "id,status,job_type,source_locale_id,target_locale_ids,scope,field_selection,product_ids,provider_meta"
      )
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

    const replayPayload = {
      jobType: job.job_type,
      sourceLocaleId: job.source_locale_id,
      targetLocaleIds: Array.isArray(job.target_locale_ids) ? job.target_locale_ids : [],
      productIds: Array.isArray(job.product_ids) ? job.product_ids : [],
      fieldSelection: job.field_selection ?? {},
      scope: job.scope ?? {},
      providerMeta: job.provider_meta ?? {},
      executionMode: "sync",
    };

    const replayHeaders = new Headers(request.headers);
    replayHeaders.set("content-type", "application/json");

    const replayRequest = new NextRequest(
      new URL(`/api/${resolved.tenant}/localization/jobs`, request.url),
      {
        method: "POST",
        headers: replayHeaders,
        body: JSON.stringify(replayPayload),
      }
    );

    const replayResponse = await createLocalizationJob(replayRequest, {
      params: Promise.resolve({ tenant: resolved.tenant }),
    });

    return replayResponse;
  } catch (error) {
    console.error("Error in localization job run POST:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
        message.toLowerCase().includes("not found")
          ? 404
          : message.toLowerCase().includes("free (sandbox)") || message.toLowerCase().includes("plan")
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
