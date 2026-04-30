import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@stack-app/database";
import { supabaseServer } from "@/lib/supabase";
import {
  normalizeJsonObject,
  normalizeOptionalString,
  normalizeStringArray,
  parsePositiveInt,
  requireUpdatesContext,
  toIsoOrNull,
} from "./_shared";

const VALID_URGENCY = new Set(["low", "normal", "high", "critical"]);
const VALID_STATUS = new Set([
  "draft",
  "scheduled",
  "published",
  "archived",
  "canceled",
]);

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

// GET /api/[tenant]/updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 10_000);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 50, 200);
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    const statusFilter = (url.searchParams.get("status") || "").trim().toLowerCase();
    const urgencyFilter = (url.searchParams.get("urgency") || "").trim().toLowerCase();
    const search = (url.searchParams.get("search") || "").trim();

    let query = supabaseServer
      .from("partner_updates")
      .select(
        "id,title,summary,urgency,status,event_label,labels,due_at,published_at,scheduled_for,created_by,updated_by,created_at,updated_at",
        { count: "exact" }
      )
      .eq("organization_id", access.context.organizationId)
      .order("updated_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (statusFilter && VALID_STATUS.has(statusFilter)) {
      query = query.eq("status", statusFilter);
    }

    if (urgencyFilter && VALID_URGENCY.has(urgencyFilter)) {
      query = query.eq("urgency", urgencyFilter);
    }

    if (search) {
      const escaped = escapeLike(search);
      query = query.ilike("title", `%${escaped}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("Error loading partner updates:", error);
      return NextResponse.json({ error: "Failed to load partner updates" }, { status: 500 });
    }

    const rows = data || [];

    // Fetch recipient analytics for all returned updates in a single query
    const analyticsMap: Record<string, { total: number; opened: number; acknowledged: number; activated: number }> = {};
    if (rows.length > 0) {
      const updateIds = rows.map((r: Record<string, unknown>) => String(r.id)).filter(Boolean);
      const { data: recipientRows } = await supabaseServer
        .from("partner_update_recipients")
        .select("partner_update_id,opened_at,acknowledged_at,activated_at")
        .eq("organization_id", access.context.organizationId)
        .in("partner_update_id", updateIds);
      for (const row of (recipientRows || []) as Array<Record<string, unknown>>) {
        const id = typeof row.partner_update_id === "string" ? row.partner_update_id : "";
        if (!id) continue;
        if (!analyticsMap[id]) analyticsMap[id] = { total: 0, opened: 0, acknowledged: 0, activated: 0 };
        analyticsMap[id].total++;
        if (row.opened_at) analyticsMap[id].opened++;
        if (row.acknowledged_at) analyticsMap[id].acknowledged++;
        if (row.activated_at) analyticsMap[id].activated++;
      }
    }

    const enrichedRows = rows.map((r: Record<string, unknown>) => {
      const id = String(r.id);
      const stats = analyticsMap[id] ?? null;
      return { ...r, analytics: stats };
    });

    return NextResponse.json({
      success: true,
      data: enrichedRows,
      meta: {
        page,
        pageSize,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error("Error in updates GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/updates
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const title = normalizeOptionalString(body.title);
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const summary = normalizeOptionalString(body.summary);
    const urgencyInput = normalizeOptionalString(body.urgency)?.toLowerCase() || "normal";
    if (!VALID_URGENCY.has(urgencyInput)) {
      return NextResponse.json(
        { error: "urgency must be one of: low, normal, high, critical" },
        { status: 400 }
      );
    }

    const statusInput = normalizeOptionalString(body.status)?.toLowerCase() || "draft";
    if (!VALID_STATUS.has(statusInput)) {
      return NextResponse.json(
        { error: "status must be one of: draft, scheduled, published, archived, canceled" },
        { status: 400 }
      );
    }
    if (statusInput === "published") {
      return NextResponse.json(
        { error: "Use publish endpoint to move an update to published status." },
        { status: 400 }
      );
    }

    const insertPayload = {
      organization_id: access.context.organizationId,
      title,
      summary,
      urgency: urgencyInput,
      status: statusInput,
      event_label: normalizeOptionalString(body.event_label || body.eventLabel),
      labels: normalizeStringArray(body.labels),
      message_json: normalizeJsonObject(body.message_json || body.messageJson) as Json,
      due_at: toIsoOrNull(body.due_at || body.dueAt),
      scheduled_for: toIsoOrNull(body.scheduled_for || body.scheduledFor),
      created_by: access.context.userId,
      updated_by: access.context.userId,
      metadata: normalizeJsonObject(body.metadata) as Json,
    };

    const { data, error } = await supabaseServer
      .from("partner_updates")
      .insert(insertPayload)
      .select(
        "id,title,summary,urgency,status,event_label,labels,message_json,due_at,published_at,scheduled_for,metadata,created_by,updated_by,created_at,updated_at"
      )
      .single();

    if (error) {
      console.error("Error creating partner update:", error);
      return NextResponse.json({ error: "Failed to create partner update" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error in updates POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
