import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingLocalizationFoundationError,
  isOwnerOrAdmin,
  requireLocalizationAccess,
} from "../../../_shared";

const CANCELLABLE_STATUSES = new Set(["queued", "running", "review_required"]);

// POST /api/[tenant]/localization/jobs/[jobId]/cancel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, role, userId } = access.context;
    if (!isOwnerOrAdmin(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can cancel localization jobs." },
        { status: 403 }
      );
    }

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
      console.error("Failed to load localization job for cancellation:", jobError);
      return NextResponse.json({ error: "Failed to cancel localization job" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Localization job not found" }, { status: 404 });
    }

    if (!CANCELLABLE_STATUSES.has(String(job.status || ""))) {
      return NextResponse.json(
        { error: `Job cannot be cancelled from status '${job.status}'.` },
        { status: 409 }
      );
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await (supabaseServer as any)
      .from("translation_jobs")
      .update({
        status: "cancelled",
        completed_at: completedAt,
        metadata: {
          cancelledBy: userId,
          cancelledAt: completedAt,
          source: "manual_cancel",
        },
      })
      .eq("organization_id", organization.id)
      .eq("id", resolved.jobId);

    if (updateError) {
      console.error("Failed to cancel localization job:", updateError);
      return NextResponse.json({ error: "Failed to cancel localization job" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in localization job cancel POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
