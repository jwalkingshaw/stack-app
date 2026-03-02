import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../../_shared";

const JOB_SELECT = `
  id,
  organization_id,
  requested_by,
  job_type,
  status,
  source_locale_id,
  target_locale_ids,
  scope,
  field_selection,
  product_ids,
  provider,
  provider_meta,
  estimated_chars,
  actual_chars,
  error_summary,
  metadata,
  started_at,
  completed_at,
  created_at,
  updated_at
`;

const ITEM_SELECT = `
  id,
  job_id,
  organization_id,
  product_id,
  product_field_id,
  field_code,
  source_scope,
  target_scope,
  source_value,
  suggested_value,
  edited_value,
  final_value,
  source_hash,
  status,
  reviewed_by,
  reviewed_at,
  applied_by,
  applied_at,
  provider_request_meta,
  provider_response_meta,
  error_message,
  metadata,
  created_at,
  updated_at
`;

// GET /api/[tenant]/localization/jobs/[jobId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const limitRaw = Number(new URL(request.url).searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

    const { data: job, error: jobError } = await (supabaseServer as any)
      .from("translation_jobs")
      .select(JOB_SELECT)
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
      console.error("Failed to load localization job:", jobError);
      return NextResponse.json({ error: "Failed to load localization job" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Localization job not found" }, { status: 404 });
    }

    const { data: items, error: itemsError } = await (supabaseServer as any)
      .from("translation_job_items")
      .select(ITEM_SELECT)
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (itemsError) {
      if (isMissingLocalizationFoundationError(itemsError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load localization job items:", itemsError);
      return NextResponse.json({ error: "Failed to load localization job items" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        job,
        items: items || [],
      },
    });
  } catch (error) {
    console.error("Error in localization job GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
