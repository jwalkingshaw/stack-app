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
  status: ItemStatus;
  suggested_value: Record<string, unknown> | null;
  edited_value: Record<string, unknown> | null;
  final_value: Record<string, unknown> | null;
};

const ITEM_SELECT = "id,status,suggested_value,edited_value,final_value";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function normalizeValueText(input: unknown): string {
  if (typeof input === "string") {
    return input.trim();
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const text = (input as Record<string, unknown>).text;
    if (typeof text === "string") return text.trim();
  }
  return "";
}

function preferredItemText(item: TranslationJobItemRow): string {
  return (
    normalizeValueText(item.final_value) ||
    normalizeValueText(item.edited_value) ||
    normalizeValueText(item.suggested_value)
  );
}

function parseBulkAction(value: unknown): "approve" | "reject" | "apply" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "approve" || normalized === "reject" || normalized === "apply") return normalized;
  return null;
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
  if (statuses.length === 0) return;

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
  } else if ((counts.approved || 0) > 0 || (counts.stale || 0) > 0) {
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

// POST /api/[tenant]/localization/jobs/[jobId]/items/bulk
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const body = await request.json().catch(() => ({}));
    const action = parseBulkAction(body?.action);
    if (!action) {
      return NextResponse.json({ error: "action must be one of: approve, reject, apply" }, { status: 400 });
    }

    const itemIds = normalizeStringArray(body?.itemIds ?? body?.item_ids);
    let query = (supabaseServer as any)
      .from("translation_job_items")
      .select(ITEM_SELECT)
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId);
    if (itemIds.length > 0) {
      query = query.in("id", itemIds);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError) {
      if (isMissingLocalizationFoundationError(itemsError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load localization items for bulk action:", itemsError);
      return NextResponse.json({ error: "Failed to load localization items" }, { status: 500 });
    }

    const rows = (items || []) as TranslationJobItemRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "No matching items found for bulk action" }, { status: 404 });
    }

    const editedValuesRaw =
      body?.editedValues && typeof body.editedValues === "object" && !Array.isArray(body.editedValues)
        ? (body.editedValues as Record<string, unknown>)
        : {};

    const successes: string[] = [];
    const failures: Array<{ itemId: string; error: string }> = [];

    if (action === "apply") {
      const origin = new URL(request.url).origin;
      const cookieHeader = request.headers.get("cookie");
      for (const item of rows) {
        const response = await fetch(
          `${origin}/api/${resolved.tenant}/localization/jobs/${resolved.jobId}/items/${item.id}/apply`,
          {
            method: "POST",
            headers: cookieHeader ? { cookie: cookieHeader } : {},
            cache: "no-store",
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          failures.push({
            itemId: item.id,
            error: payload.error || "Failed to apply item",
          });
          continue;
        }
        successes.push(item.id);
      }
    } else {
      const nowIso = new Date().toISOString();
      for (const item of rows) {
        if (item.status === "applied" || item.status === "failed") {
          failures.push({
            itemId: item.id,
            error: `Cannot ${action} item with status '${item.status}'.`,
          });
          continue;
        }

        if (action === "reject") {
          const { error: updateError } = await (supabaseServer as any)
            .from("translation_job_items")
            .update({
              status: "rejected",
              reviewed_by: userId,
              reviewed_at: nowIso,
              edited_value: null,
              final_value: null,
              error_message: null,
            })
            .eq("organization_id", organization.id)
            .eq("job_id", resolved.jobId)
            .eq("id", item.id);

          if (updateError) {
            failures.push({ itemId: item.id, error: "Failed to reject item" });
            continue;
          }
          successes.push(item.id);
          continue;
        }

        const editedValue = editedValuesRaw[item.id];
        const editedText =
          normalizeValueText(editedValue) ||
          preferredItemText(item);
        if (!editedText) {
          failures.push({
            itemId: item.id,
            error: "No suggested/edited value is available for approval.",
          });
          continue;
        }

        const finalValue = { text: editedText };
        const { error: updateError } = await (supabaseServer as any)
          .from("translation_job_items")
          .update({
            status: "approved",
            reviewed_by: userId,
            reviewed_at: nowIso,
            edited_value: finalValue,
            final_value: finalValue,
            error_message: null,
          })
          .eq("organization_id", organization.id)
          .eq("job_id", resolved.jobId)
          .eq("id", item.id);

        if (updateError) {
          failures.push({ itemId: item.id, error: "Failed to approve item" });
          continue;
        }
        successes.push(item.id);
      }
    }

    await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });

    return NextResponse.json({
      success: true,
      data: {
        action,
        successCount: successes.length,
        failureCount: failures.length,
        successes,
        failures,
      },
    });
  } catch (error) {
    console.error("Error in localization job bulk item POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
