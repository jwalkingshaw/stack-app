import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  normalizeJsonObject,
  normalizeOptionalString,
  normalizeStringArray,
  requireUpdatesContext,
  toIsoOrNull,
} from "../_shared";

const VALID_URGENCY = new Set(["low", "normal", "high", "critical"]);
const VALID_STATUS = new Set([
  "draft",
  "scheduled",
  "published",
  "archived",
  "canceled",
]);

// GET /api/[tenant]/updates/[updateId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { data, error } = await supabaseServer
      .from("partner_updates")
      .select(
        "id,title,summary,urgency,status,event_label,labels,message_json,due_at,published_at,scheduled_for,metadata,created_by,updated_by,created_at,updated_at"
      )
      .eq("organization_id", access.context.organizationId)
      .eq("id", resolvedParams.updateId)
      .maybeSingle();

    if (error) {
      console.error("Error loading partner update detail:", error);
      return NextResponse.json({ error: "Failed to load partner update" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Partner update not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in update detail GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/updates/[updateId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const updatePayload: Record<string, unknown> = {
      updated_by: access.context.userId,
    };

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = normalizeOptionalString(body.title);
      if (!title) {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      updatePayload.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(body, "summary")) {
      updatePayload.summary = normalizeOptionalString(body.summary);
    }

    if (Object.prototype.hasOwnProperty.call(body, "urgency")) {
      const urgency = normalizeOptionalString(body.urgency)?.toLowerCase();
      if (!urgency || !VALID_URGENCY.has(urgency)) {
        return NextResponse.json(
          { error: "urgency must be one of: low, normal, high, critical" },
          { status: 400 }
        );
      }
      updatePayload.urgency = urgency;
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeOptionalString(body.status)?.toLowerCase();
      if (!status || !VALID_STATUS.has(status)) {
        return NextResponse.json(
          { error: "status must be one of: draft, scheduled, published, archived, canceled" },
          { status: 400 }
        );
      }
      updatePayload.status = status;
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "event_label") ||
      Object.prototype.hasOwnProperty.call(body, "eventLabel")
    ) {
      updatePayload.event_label = normalizeOptionalString(body.event_label || body.eventLabel);
    }

    if (Object.prototype.hasOwnProperty.call(body, "labels")) {
      updatePayload.labels = normalizeStringArray(body.labels);
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "message_json") ||
      Object.prototype.hasOwnProperty.call(body, "messageJson")
    ) {
      updatePayload.message_json = normalizeJsonObject(body.message_json || body.messageJson);
    }

    if (Object.prototype.hasOwnProperty.call(body, "due_at") || Object.prototype.hasOwnProperty.call(body, "dueAt")) {
      updatePayload.due_at = toIsoOrNull(body.due_at || body.dueAt);
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "scheduled_for") ||
      Object.prototype.hasOwnProperty.call(body, "scheduledFor")
    ) {
      updatePayload.scheduled_for = toIsoOrNull(body.scheduled_for || body.scheduledFor);
    }

    if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
      updatePayload.metadata = normalizeJsonObject(body.metadata);
    }

    if (Object.keys(updatePayload).length === 1) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("partner_updates")
      .update(updatePayload)
      .eq("organization_id", access.context.organizationId)
      .eq("id", resolvedParams.updateId)
      .select(
        "id,title,summary,urgency,status,event_label,labels,message_json,due_at,published_at,scheduled_for,metadata,created_by,updated_by,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      console.error("Error updating partner update:", error);
      return NextResponse.json({ error: "Failed to update partner update" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Partner update not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in update detail PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
