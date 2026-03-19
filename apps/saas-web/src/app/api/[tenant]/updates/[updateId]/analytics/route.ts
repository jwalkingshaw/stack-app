import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUpdatesContext } from "../../_shared";

function percentile50(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function toSeconds(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.round((toMs - fromMs) / 1000);
}

// GET /api/[tenant]/updates/[updateId]/analytics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { data: updateRow, error: updateError } = await supabaseServer
      .from("partner_updates")
      .select("id,title,status,urgency,due_at,published_at,created_at,updated_at")
      .eq("organization_id", access.context.organizationId)
      .eq("id", resolvedParams.updateId)
      .maybeSingle();

    if (updateError) {
      console.error("Failed to load partner update for analytics:", updateError);
      return NextResponse.json({ error: "Failed to load update analytics" }, { status: 500 });
    }
    if (!updateRow) {
      return NextResponse.json({ error: "Partner update not found" }, { status: 404 });
    }

    const { data: recipients, error: recipientsError } = await supabaseServer
      .from("partner_update_recipients")
      .select(
        "id,partner_organization_id,status,first_notified_at,opened_at,acknowledged_at,activated_at,due_at,created_at,updated_at"
      )
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .order("updated_at", { ascending: false });

    if (recipientsError) {
      console.error("Failed to load partner update recipients:", recipientsError);
      return NextResponse.json({ error: "Failed to load update analytics" }, { status: 500 });
    }

    const { data: publicShareActivity, error: publicShareActivityError } = await supabaseServer
      .from("partner_update_activity")
      .select("event_type,metadata")
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .eq("event_type", "public_share_opened");

    if (publicShareActivityError) {
      console.error("Failed to load public share activity:", publicShareActivityError);
      return NextResponse.json({ error: "Failed to load update analytics" }, { status: 500 });
    }

    const recipientRows = (recipients || []) as Array<{
      id: string;
      partner_organization_id: string | null;
      status: string | null;
      first_notified_at: string | null;
      opened_at: string | null;
      acknowledged_at: string | null;
      activated_at: string | null;
      due_at: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>;
    const publicShareRows = (publicShareActivity || []) as Array<{
      event_type: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    const nowMs = Date.now();
    const publishedAt = updateRow.published_at ? String(updateRow.published_at) : null;

    const notifiedCount = recipientRows.filter(
      (row) =>
        Boolean(row.first_notified_at) ||
        (row.status && row.status !== "queued")
    ).length;
    const openedCount = recipientRows.filter(
      (row) =>
        Boolean(row.opened_at) ||
        row.status === "opened" ||
        row.status === "acknowledged" ||
        row.status === "activated"
    ).length;
    const acknowledgedCount = recipientRows.filter(
      (row) =>
        Boolean(row.acknowledged_at) ||
        row.status === "acknowledged" ||
        row.status === "activated"
    ).length;
    const activatedCount = recipientRows.filter(
      (row) => Boolean(row.activated_at) || row.status === "activated"
    ).length;

    const overdueCount = recipientRows.filter((row) => {
      if (!row.due_at) return false;
      const dueMs = Date.parse(row.due_at);
      if (!Number.isFinite(dueMs) || dueMs > nowMs) return false;
      return !(
        row.status === "acknowledged" ||
        row.status === "activated" ||
        row.status === "muted"
      );
    }).length;

    const acknowledgeDurationsSeconds = recipientRows
      .map((row) => toSeconds(publishedAt, row.acknowledged_at))
      .filter((value): value is number => value !== null);
    const activateDurationsSeconds = recipientRows
      .map((row) => toSeconds(publishedAt, row.activated_at))
      .filter((value): value is number => value !== null);

    const recipientCount = recipientRows.length;
    const publicShareOpenCount = publicShareRows.length;
    const uniquePublicViewerKeys = new Set(
      publicShareRows
        .map((row) => {
          const metadata =
            row.metadata &&
            typeof row.metadata === "object" &&
            !Array.isArray(row.metadata)
              ? row.metadata
              : null;
          const viewerKey = metadata?.viewerKey;
          return typeof viewerKey === "string" ? viewerKey : null;
        })
        .filter((value): value is string => Boolean(value))
    );
    const uniquePublicViewerCount = uniquePublicViewerKeys.size;
    const toRate = (value: number) =>
      recipientCount > 0 ? Number((value / recipientCount).toFixed(4)) : 0;

    return NextResponse.json({
      success: true,
      data: {
        update: {
          id: String(updateRow.id),
          title: String(updateRow.title || ""),
          status: String(updateRow.status || "draft"),
          urgency: String(updateRow.urgency || "normal"),
          dueAt: updateRow.due_at ? String(updateRow.due_at) : null,
          publishedAt,
          createdAt: updateRow.created_at ? String(updateRow.created_at) : null,
          updatedAt: updateRow.updated_at ? String(updateRow.updated_at) : null,
        },
        metrics: {
          publishCount: publishedAt ? 1 : 0,
          recipientCount,
          notifiedCount,
          openCount: openedCount,
          acknowledgeCount: acknowledgedCount,
          activationCount: activatedCount,
          overdueRecipientCount: overdueCount,
          notifiedRate: toRate(notifiedCount),
          openRate: toRate(openedCount),
          acknowledgeRate: toRate(acknowledgedCount),
          activationRate: toRate(activatedCount),
          medianTimeToAcknowledgeSeconds: percentile50(acknowledgeDurationsSeconds),
          medianTimeToActivateSeconds: percentile50(activateDurationsSeconds),
          publicShareOpenCount,
          uniquePublicViewerCount,
        },
        recipients: recipientRows.map((row) => ({
          id: row.id,
          partnerOrganizationId: row.partner_organization_id,
          status: row.status || "queued",
          firstNotifiedAt: row.first_notified_at,
          openedAt: row.opened_at,
          acknowledgedAt: row.acknowledged_at,
          activatedAt: row.activated_at,
          dueAt: row.due_at,
          updatedAt: row.updated_at,
        })),
      },
    });
  } catch (error) {
    console.error("Error in update analytics GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
