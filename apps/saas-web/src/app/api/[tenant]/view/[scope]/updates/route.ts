import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import {
  parsePositiveInt,
  requirePartnerUpdatesScopeContext,
} from "./_shared";

// GET /api/[tenant]/view/[scope]/updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string }> }
) {
  try {
    const resolvedParams = await params;
    const scopeAccess = await requirePartnerUpdatesScopeContext({
      request,
      tenantSlug: resolvedParams.tenant,
      scope: resolvedParams.scope,
    });
    if (!scopeAccess.ok) return scopeAccess.response;

    if (scopeAccess.allowedBrandOrganizationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { page: 1, pageSize: 50, total: 0 },
      });
    }

    const requestUrl = new URL(request.url);
    const page = parsePositiveInt(requestUrl.searchParams.get("page"), 1, 10_000);
    const pageSize = parsePositiveInt(requestUrl.searchParams.get("pageSize"), 50, 200);
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;
    const statusFilter = (requestUrl.searchParams.get("status") || "")
      .trim()
      .toLowerCase();
    const urgencyFilter = (requestUrl.searchParams.get("urgency") || "")
      .trim()
      .toLowerCase();
    const search = (requestUrl.searchParams.get("search") || "").trim().toLowerCase();

    let recipientQuery = getSupabaseServer()
      .from("partner_update_recipients")
      .select(
        "id,organization_id,partner_update_id,status,delivery_channels,first_notified_at,opened_at,acknowledged_at,activated_at,due_at,updated_at",
        { count: "exact" }
      )
      .eq("partner_organization_id", scopeAccess.partnerOrganizationId)
      .in("organization_id", scopeAccess.allowedBrandOrganizationIds)
      .order("updated_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (statusFilter) {
      recipientQuery = recipientQuery.eq("status", statusFilter);
    }

    const { data: recipientRows, count, error: recipientError } = await recipientQuery;
    if (recipientError) {
      console.error("Failed to load partner update recipients list:", recipientError);
      return NextResponse.json({ error: "Failed to load updates" }, { status: 500 });
    }

    const recipients = (recipientRows || []) as Array<{
      id: string;
      organization_id: string | null;
      partner_update_id: string | null;
      status: string | null;
      delivery_channels: string[] | null;
      first_notified_at: string | null;
      opened_at: string | null;
      acknowledged_at: string | null;
      activated_at: string | null;
      due_at: string | null;
      updated_at: string | null;
    }>;
    const updateIds = Array.from(
      new Set(
        recipients
          .map((row) => row.partner_update_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (updateIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          page,
          pageSize,
          total: count || 0,
        },
      });
    }

    let updatesQuery = getSupabaseServer()
      .from("partner_updates")
      .select(
        "id,organization_id,title,summary,urgency,status,event_label,labels,due_at,published_at,scheduled_for,updated_at"
      )
      .eq("status", "published")
      .in("id", updateIds)
      .in("organization_id", scopeAccess.allowedBrandOrganizationIds);

    if (urgencyFilter) {
      updatesQuery = updatesQuery.eq("urgency", urgencyFilter);
    }

    const { data: updateRows, error: updateError } = await updatesQuery;
    if (updateError) {
      console.error("Failed to load partner updates:", updateError);
      return NextResponse.json({ error: "Failed to load updates" }, { status: 500 });
    }

    const updates = (updateRows || []) as Array<{
      id: string;
      organization_id: string | null;
      title: string | null;
      summary: string | null;
      urgency: string | null;
      status: string | null;
      event_label: string | null;
      labels: string[] | null;
      due_at: string | null;
      published_at: string | null;
      scheduled_for: string | null;
      updated_at: string | null;
    }>;
    const updateById = new Map(updates.map((row) => [String(row.id), row]));

    const brandIds = Array.from(
      new Set(
        updates
          .map((row) => row.organization_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const { data: organizationRows } = await getSupabaseServer()
      .from("organizations")
      .select("id,name,slug")
      .in("id", brandIds);
    const organizationById = new Map(
      ((organizationRows || []) as Array<{ id: string; name: string | null; slug: string | null }>)
        .filter((row) => Boolean(row.id))
        .map((row) => [row.id, row])
    );

    const mappedItems = recipients
      .map((recipient) => {
        const update = recipient.partner_update_id
          ? updateById.get(recipient.partner_update_id)
          : undefined;
        if (!update) return null;
        const organizationId = String(update.organization_id || "");
        const brand = organizationById.get(organizationId);
        return {
          recipient: {
            id: recipient.id,
            status: recipient.status || "queued",
            deliveryChannels: Array.isArray(recipient.delivery_channels)
              ? recipient.delivery_channels
              : [],
            firstNotifiedAt: recipient.first_notified_at,
            openedAt: recipient.opened_at,
            acknowledgedAt: recipient.acknowledged_at,
            activatedAt: recipient.activated_at,
            dueAt: recipient.due_at,
            updatedAt: recipient.updated_at,
          },
          update: {
            id: String(update.id),
            organizationId,
            title: String(update.title || ""),
            summary: update.summary ? String(update.summary) : null,
            urgency: String(update.urgency || "normal"),
            status: String(update.status || "published"),
            eventLabel: update.event_label ? String(update.event_label) : null,
            labels: Array.isArray(update.labels) ? update.labels : [],
            dueAt: update.due_at ? String(update.due_at) : null,
            publishedAt: update.published_at ? String(update.published_at) : null,
            scheduledFor: update.scheduled_for ? String(update.scheduled_for) : null,
            updatedAt: update.updated_at ? String(update.updated_at) : null,
          },
          brand: {
            id: organizationId,
            name: brand?.name || null,
            slug: brand?.slug || null,
          },
        };
      })
      .filter((item) => item !== null);

    let items = mappedItems;

    if (search) {
      items = items.filter((item) => item.update.title.toLowerCase().includes(search));
    }

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        page,
        pageSize,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error("Error in view scope updates GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
