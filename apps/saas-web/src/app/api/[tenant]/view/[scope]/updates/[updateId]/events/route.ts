import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { appendUpdateActivity } from "../../../../../updates/_delivery";
import {
  ensurePartnerUpdateRecipient,
  requirePartnerUpdatesScopeContext,
} from "../../_shared";

const ALLOWED_EVENT_TYPES = new Set([
  "opened",
  "kit_item_viewed",
  "kit_item_downloaded",
  "copied",
]);

function normalizeMetadata(
  value: unknown,
  fallback: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value as Record<string, unknown>;
}

// POST /api/[tenant]/view/[scope]/updates/[updateId]/events
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const scopeAccess = await requirePartnerUpdatesScopeContext({
      request,
      tenantSlug: resolvedParams.tenant,
      scope: resolvedParams.scope,
    });
    if (!scopeAccess.ok) return scopeAccess.response;

    const recipientResult = await ensurePartnerUpdateRecipient({
      updateId: resolvedParams.updateId,
      partnerOrganizationId: scopeAccess.partnerOrganizationId,
      allowedBrandOrganizationIds: scopeAccess.allowedBrandOrganizationIds,
    });
    if (!recipientResult.ok) {
      return NextResponse.json(
        { error: recipientResult.error },
        { status: recipientResult.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const eventType = String(body.eventType || body.event_type || "").trim().toLowerCase();
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        {
          error:
            "eventType must be one of: opened, kit_item_viewed, kit_item_downloaded, copied",
        },
        { status: 400 }
      );
    }

    const recipient = recipientResult.recipient;
    const nowIso = new Date().toISOString();
    const metadata = normalizeMetadata(body.metadata);

    if (eventType === "opened") {
      const nextStatus =
        recipient.status === "queued" || recipient.status === "notified"
          ? "opened"
          : recipient.status;
      await supabaseServer
        .from("partner_update_recipients")
        .update({
          status: nextStatus,
          first_notified_at: recipient.firstNotifiedAt || nowIso,
          opened_at: recipient.openedAt || nowIso,
        })
        .eq("id", recipient.id);
    }

    await appendUpdateActivity({
      organizationId: recipient.organizationId,
      updateId: resolvedParams.updateId,
      actorUserId: scopeAccess.userId,
      rows: [
        {
          partnerOrganizationId: scopeAccess.partnerOrganizationId,
          eventType,
          metadata,
          eventAt: nowIso,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in update events POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
