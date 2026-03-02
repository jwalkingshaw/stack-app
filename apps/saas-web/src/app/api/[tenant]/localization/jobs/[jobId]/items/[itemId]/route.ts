import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../../../../_shared";

type ItemStatus =
  | "queued"
  | "generated"
  | "reviewed"
  | "approved"
  | "rejected"
  | "applied"
  | "failed"
  | "stale";

type JobStatus = "queued" | "running" | "review_required" | "completed" | "failed" | "cancelled";

type TranslationJobItemRow = {
  id: string;
  job_id: string;
  organization_id: string;
  status: ItemStatus;
  suggested_value: Record<string, unknown> | null;
  edited_value: Record<string, unknown> | null;
  final_value: Record<string, unknown> | null;
};

const ITEM_SELECT = `
  id,
  job_id,
  organization_id,
  status,
  suggested_value,
  edited_value,
  final_value
`;

function normalizeValueText(input: unknown): string {
  if (typeof input === "string") {
    return input.trim();
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const textValue = (input as Record<string, unknown>).text;
    if (typeof textValue === "string") {
      return textValue.trim();
    }
  }

  return "";
}

function buildEditedValue(text: string): Record<string, string> {
  return { text };
}

async function refreshJobStatus(params: {
  organizationId: string;
  jobId: string;
}): Promise<void> {
  const { data: itemRows, error: itemError } = await (supabaseServer as any)
    .from("translation_job_items")
    .select("status")
    .eq("organization_id", params.organizationId)
    .eq("job_id", params.jobId);

  if (itemError) {
    console.error("Failed to refresh job status (item fetch):", itemError);
    return;
  }

  const statuses = ((itemRows || []) as Array<{ status: ItemStatus }>).map((row) => row.status);
  if (statuses.length === 0) {
    return;
  }

  const counts = statuses.reduce(
    (acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  let nextStatus: JobStatus = "review_required";
  if ((counts.failed || 0) === statuses.length) {
    nextStatus = "failed";
  } else if ((counts.applied || 0) === statuses.length) {
    nextStatus = "completed";
  } else if ((counts.rejected || 0) === statuses.length) {
    nextStatus = "completed";
  } else if ((counts.queued || 0) > 0 || (counts.generated || 0) > 0 || (counts.reviewed || 0) > 0) {
    nextStatus = "review_required";
  } else if ((counts.approved || 0) > 0) {
    nextStatus = "review_required";
  } else if ((counts.stale || 0) > 0) {
    nextStatus = "review_required";
  }

  const completedAt =
    nextStatus === "completed" || nextStatus === "failed" ? new Date().toISOString() : null;

  const { error: updateError } = await (supabaseServer as any)
    .from("translation_jobs")
    .update({
      status: nextStatus,
      completed_at: completedAt,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.jobId);

  if (updateError) {
    console.error("Failed to refresh job status (job update):", updateError);
  }
}

function normalizeAction(value: unknown): "edit" | "approve" | "reject" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "edit" || normalized === "approve" || normalized === "reject") {
    return normalized;
  }
  return null;
}

// PATCH /api/[tenant]/localization/jobs/[jobId]/items/[itemId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string; itemId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const body = await request.json().catch(() => ({}));
    const action = normalizeAction(body?.action);

    if (!action) {
      return NextResponse.json(
        { error: "action must be one of: edit, approve, reject" },
        { status: 400 }
      );
    }

    const { data: item, error: itemError } = await (supabaseServer as any)
      .from("translation_job_items")
      .select(ITEM_SELECT)
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId)
      .eq("id", resolved.itemId)
      .maybeSingle();

    if (itemError) {
      if (isMissingLocalizationFoundationError(itemError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load translation job item:", itemError);
      return NextResponse.json({ error: "Failed to load translation job item" }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: "Translation job item not found" }, { status: 404 });
    }

    const itemRow = item as TranslationJobItemRow;
    if (itemRow.status === "applied") {
      return NextResponse.json({ error: "Applied items cannot be edited." }, { status: 409 });
    }

    if (action === "reject") {
      const rejectedAt = new Date().toISOString();
      const { error: rejectError } = await (supabaseServer as any)
        .from("translation_job_items")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: rejectedAt,
          edited_value: null,
          final_value: null,
          error_message: null,
        })
        .eq("organization_id", organization.id)
        .eq("job_id", resolved.jobId)
        .eq("id", resolved.itemId);

      if (rejectError) {
        console.error("Failed to reject translation job item:", rejectError);
        return NextResponse.json({ error: "Failed to reject item" }, { status: 500 });
      }

      await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });
      return NextResponse.json({ success: true });
    }

    const editedText = normalizeValueText(body?.editedValue ?? body?.edited_value ?? body?.value);
    if (!editedText) {
      return NextResponse.json(
        { error: "editedValue.text (or string editedValue) is required for edit/approve actions." },
        { status: 400 }
      );
    }

    const editedValue = buildEditedValue(editedText);
    const reviewedAt = new Date().toISOString();

    if (action === "edit") {
      const { error: editError } = await (supabaseServer as any)
        .from("translation_job_items")
        .update({
          status: "reviewed",
          edited_value: editedValue,
          reviewed_by: userId,
          reviewed_at: reviewedAt,
          final_value: null,
          error_message: null,
        })
        .eq("organization_id", organization.id)
        .eq("job_id", resolved.jobId)
        .eq("id", resolved.itemId);

      if (editError) {
        console.error("Failed to edit translation job item:", editError);
        return NextResponse.json({ error: "Failed to save edited value" }, { status: 500 });
      }

      await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });
      return NextResponse.json({ success: true });
    }

    const { error: approveError } = await (supabaseServer as any)
      .from("translation_job_items")
      .update({
        status: "approved",
        edited_value: editedValue,
        final_value: editedValue,
        reviewed_by: userId,
        reviewed_at: reviewedAt,
        error_message: null,
      })
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId)
      .eq("id", resolved.itemId);

    if (approveError) {
      console.error("Failed to approve translation job item:", approveError);
      return NextResponse.json({ error: "Failed to approve item" }, { status: 500 });
    }

    await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in translation job item PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
