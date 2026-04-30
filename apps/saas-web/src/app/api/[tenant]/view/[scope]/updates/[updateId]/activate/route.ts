import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-audit";
import { getSupabaseServer } from "@/lib/supabase";
import { appendUpdateActivity } from "../../../../../updates/_delivery";
import {
  ensurePartnerUpdateRecipient,
  requirePartnerUpdatesScopeContext,
} from "../../_shared";

async function isActionableUpdate(params: {
  organizationId: string;
  updateId: string;
}): Promise<boolean> {
  const { count, error } = await getSupabaseServer()
    .from("partner_update_kit_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId);

  if (error) return false;
  return (count || 0) > 0;
}

// POST /api/[tenant]/view/[scope]/updates/[updateId]/activate
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

    const recipient = recipientResult.recipient;
    const actionable = await isActionableUpdate({
      organizationId: recipient.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!actionable) {
      return NextResponse.json(
        { error: "This update is informational only." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await getSupabaseServer()
      .from("partner_update_recipients")
      .update({
        status: "activated",
        first_notified_at: recipient.firstNotifiedAt || nowIso,
        opened_at: recipient.openedAt || nowIso,
        acknowledged_at: recipient.acknowledgedAt || nowIso,
        activated_at: recipient.activatedAt || nowIso,
      })
      .eq("id", recipient.id)
      .select(
        "id,status,opened_at,acknowledged_at,activated_at,first_notified_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      console.error("Failed to activate partner update:", error);
      return NextResponse.json({ error: "Failed to activate update" }, { status: 500 });
    }

    await appendUpdateActivity({
      organizationId: recipient.organizationId,
      updateId: resolvedParams.updateId,
      actorUserId: scopeAccess.userId,
      rows: [
        {
          partnerOrganizationId: scopeAccess.partnerOrganizationId,
          eventType: "activated",
          metadata: {
            source: "partner_action",
          },
          eventAt: nowIso,
        },
      ],
    });

    await logSecurityEvent(getSupabaseServer(), {
      organizationId: recipient.organizationId,
      actorUserId: scopeAccess.userId,
      action: "partner_update.activate",
      resourceType: "partner_update",
      resourceId: resolvedParams.updateId,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        partner_organization_id: scopeAccess.partnerOrganizationId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: data?.id || recipient.id,
        status: data?.status || "activated",
        firstNotifiedAt: data?.first_notified_at || recipient.firstNotifiedAt || nowIso,
        openedAt: data?.opened_at || recipient.openedAt || nowIso,
        acknowledgedAt: data?.acknowledged_at || recipient.acknowledgedAt || nowIso,
        activatedAt: data?.activated_at || recipient.activatedAt || nowIso,
        updatedAt: data?.updated_at || nowIso,
      },
    });
  } catch (error) {
    console.error("Error in activate POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
