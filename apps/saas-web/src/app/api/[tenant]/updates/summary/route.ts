import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUpdatesContext } from "../_shared";

type UpdateSummaryRow = {
  id: string;
  title: string;
  status: string;
  urgency: string;
  due_at: string | null;
  published_at: string | null;
  updated_at: string;
};

// GET /api/[tenant]/updates/summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const organizationId = access.context.organizationId;
    const nowIso = new Date().toISOString();

    const [
      { count: totalUpdates },
      { count: publishedUpdates },
      { count: draftUpdates },
      { count: totalRecipients },
      { count: openedRecipients },
      { count: acknowledgedRecipients },
      { count: activatedRecipients },
      { count: overdueRecipients },
      { data: recentUpdates, error: recentUpdatesError },
      { data: allKitRows, error: allKitRowsError },
    ] = await Promise.all([
      getSupabaseServer()
        .from("partner_updates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      getSupabaseServer()
        .from("partner_updates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "published"),
      getSupabaseServer()
        .from("partner_updates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "draft"),
      getSupabaseServer()
        .from("partner_update_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      getSupabaseServer()
        .from("partner_update_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["opened", "acknowledged", "activated"]),
      getSupabaseServer()
        .from("partner_update_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["acknowledged", "activated"]),
      getSupabaseServer()
        .from("partner_update_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "activated"),
      getSupabaseServer()
        .from("partner_update_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .lt("due_at", nowIso)
        .not("status", "in", "(acknowledged,activated,muted)"),
      getSupabaseServer()
        .from("partner_updates")
        .select("id,title,status,urgency,due_at,published_at,updated_at")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(8),
      getSupabaseServer()
        .from("partner_update_kit_items")
        .select("partner_update_id")
        .eq("organization_id", organizationId),
    ]);

    if (recentUpdatesError) {
      console.error("Failed to load recent updates summary:", recentUpdatesError);
      return NextResponse.json({ error: "Failed to load update summary" }, { status: 500 });
    }
    if (allKitRowsError) {
      console.error("Failed to load kit item summary:", allKitRowsError);
      return NextResponse.json({ error: "Failed to load update summary" }, { status: 500 });
    }

    const allKitRowsNormalized = (allKitRows || []) as Array<{
      partner_update_id: string | null;
    }>;
    const updatesWithKit = new Set(
      allKitRowsNormalized
        .map((row) => row.partner_update_id)
        .filter((id): id is string => Boolean(id))
    );

    const recentUpdateRows = (recentUpdates || []) as UpdateSummaryRow[];
    const recentUpdateIds = recentUpdateRows.map((row) => row.id);

    let recipientRowsByUpdateId = new Map<
      string,
      Array<{ status: string | null }>
    >();
    if (recentUpdateIds.length > 0) {
      const { data: recipientRows, error: recipientRowsError } = await getSupabaseServer()
        .from("partner_update_recipients")
        .select("partner_update_id,status")
        .eq("organization_id", organizationId)
        .in("partner_update_id", recentUpdateIds);

      if (recipientRowsError) {
        console.error("Failed to load recent recipient rows:", recipientRowsError);
        return NextResponse.json({ error: "Failed to load update summary" }, { status: 500 });
      }

      recipientRowsByUpdateId = (recipientRows || []).reduce(
        (
          acc: Map<string, Array<{ status: string | null }>>,
          row: { partner_update_id: string | null; status: string | null }
        ) => {
          if (!row.partner_update_id) return acc;
          const existing = acc.get(row.partner_update_id) || [];
          existing.push({ status: row.status || null });
          acc.set(row.partner_update_id, existing);
          return acc;
        },
        new Map()
      );
    }

    const recent = recentUpdateRows.map((row) => {
      const recipientRows = recipientRowsByUpdateId.get(row.id) || [];
      const recipientCount = recipientRows.length;
      const openCount = recipientRows.filter((item) =>
        item.status
          ? ["opened", "acknowledged", "activated"].includes(item.status)
          : false
      ).length;
      const acknowledgeCount = recipientRows.filter((item) =>
        item.status ? ["acknowledged", "activated"].includes(item.status) : false
      ).length;

      return {
        id: row.id,
        title: row.title,
        status: row.status,
        urgency: row.urgency,
        dueAt: row.due_at,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        recipientCount,
        openCount,
        acknowledgeCount,
        openRate: recipientCount > 0 ? Number((openCount / recipientCount).toFixed(4)) : 0,
        hasKit: updatesWithKit.has(row.id),
      };
    });

    const recipientCount = totalRecipients || 0;
    const openCount = openedRecipients || 0;
    const acknowledgeCount = acknowledgedRecipients || 0;
    const activationCount = activatedRecipients || 0;

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          updates: totalUpdates || 0,
          published: publishedUpdates || 0,
          draft: draftUpdates || 0,
          updatesWithKit: updatesWithKit.size,
          kitItems: allKitRowsNormalized.length,
          recipients: recipientCount,
          opened: openCount,
          acknowledged: acknowledgeCount,
          activated: activationCount,
          overdueRecipients: overdueRecipients || 0,
          openRate: recipientCount > 0 ? Number((openCount / recipientCount).toFixed(4)) : 0,
        },
        recent,
      },
    });
  } catch (error) {
    console.error("Error in update summary GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
