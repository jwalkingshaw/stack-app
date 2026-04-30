import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-audit";
import { requireUpdatesContext, toIsoOrNull } from "../../_shared";
import {
  appendUpdateActivity,
  buildRecipientDispatchDecisions,
  getUpdateForDelivery,
  normalizeDeliveryChannels,
  normalizeRecipientSelection,
  resolveRecipientOrganizations,
  setScheduledUpdateState,
  upsertPartnerUpdateRecipients,
  validateRecipientKitAccess,
} from "../../_delivery";
import { getSupabaseServer } from "@/lib/supabase";

// POST /api/[tenant]/updates/[updateId]/schedule
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const loadedUpdate = await getUpdateForDelivery({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!loadedUpdate.ok) {
      return NextResponse.json({ error: loadedUpdate.error }, { status: loadedUpdate.status });
    }

    if (loadedUpdate.update.status === "published") {
      return NextResponse.json(
        { error: "Update is already published and cannot be rescheduled" },
        { status: 400 }
      );
    }
    if (loadedUpdate.update.status === "archived" || loadedUpdate.update.status === "canceled") {
      return NextResponse.json(
        { error: "Archived or canceled updates cannot be scheduled" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const scheduledFor = toIsoOrNull(body.scheduledFor || body.scheduled_for);
    if (!scheduledFor) {
      return NextResponse.json(
        { error: "scheduledFor is required and must be a valid datetime" },
        { status: 400 }
      );
    }

    const scheduledMs = Date.parse(scheduledFor);
    if (!Number.isFinite(scheduledMs) || scheduledMs <= Date.now()) {
      return NextResponse.json(
        { error: "scheduledFor must be in the future" },
        { status: 400 }
      );
    }

    const recipientSelection = normalizeRecipientSelection(body.recipientSelection);
    const allowNoRecipients =
      body.allowNoRecipients === true || body.allow_no_recipients === true;
    const requestedChannels = normalizeDeliveryChannels(
      body.deliveryChannels || body.delivery_channels || ["in_app", "email"]
    );

    const hasExplicitRecipientSelection =
      recipientSelection.partnerOrganizationIds.length > 0 ||
      recipientSelection.shareSetIds.length > 0 ||
      recipientSelection.marketIds.length > 0 ||
      recipientSelection.channelIds.length > 0 ||
      recipientSelection.localeIds.length > 0;
    let partnerOrganizationIds: string[] = [];
    if (!(allowNoRecipients && !hasExplicitRecipientSelection)) {
      const recipientResolution = await resolveRecipientOrganizations({
        organizationId: access.context.organizationId,
        recipientSelection,
      });
      if (!recipientResolution.ok) {
        return NextResponse.json(
          { error: recipientResolution.error },
          { status: recipientResolution.status }
        );
      }
      partnerOrganizationIds = recipientResolution.partnerOrganizationIds;
    }

    if (
      partnerOrganizationIds.length === 0 &&
      !(allowNoRecipients && !hasExplicitRecipientSelection)
    ) {
      return NextResponse.json(
        { error: "No eligible active partner recipients matched this selection" },
        { status: 400 }
      );
    }

    if (partnerOrganizationIds.length > 0) {
      const kitAccessValidation = await validateRecipientKitAccess({
        organizationId: access.context.organizationId,
        updateId: resolvedParams.updateId,
        partnerOrganizationIds,
      });
      if (!kitAccessValidation.ok) {
        return NextResponse.json(
          { error: kitAccessValidation.error, blockedRecipients: kitAccessValidation.blockedRecipients },
          { status: kitAccessValidation.status }
        );
      }
    }

    const dispatchDecisions = await buildRecipientDispatchDecisions({
      organizationId: access.context.organizationId,
      partnerOrganizationIds,
      requestedChannels,
    });

    const recipientsResult = await upsertPartnerUpdateRecipients({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      dueAt: loadedUpdate.update.due_at,
      recipients: dispatchDecisions,
      status: "queued",
    });
    if (!recipientsResult.ok) {
      return NextResponse.json({ error: recipientsResult.error }, { status: recipientsResult.status });
    }

    const scheduleState = await setScheduledUpdateState({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      userId: access.context.userId,
      scheduledFor,
    });
    if (!scheduleState.ok) {
      return NextResponse.json({ error: scheduleState.error }, { status: scheduleState.status });
    }

    const blockedEmailCount = requestedChannels.includes("email")
      ? dispatchDecisions.filter((recipient) => !recipient.consent.email.allowed).length
      : 0;

    await appendUpdateActivity({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      actorUserId: access.context.userId,
      rows: [
        {
          eventType: "scheduled",
          metadata: {
            scheduled_for: scheduledFor,
            recipient_count: dispatchDecisions.length,
            requested_channels: requestedChannels,
          },
        },
        ...dispatchDecisions.map((recipient) => ({
          partnerOrganizationId: recipient.partnerOrganizationId,
          eventType: "recipient_queued",
          metadata: {
            delivery_channels: recipient.deliveryChannels,
            consent: recipient.consent,
            trigger: "schedule",
          },
        })),
      ],
    });

    await logSecurityEvent(getSupabaseServer(), {
      organizationId: access.context.organizationId,
      actorUserId: access.context.userId,
      action: "partner_update.schedule",
      resourceType: "partner_update",
      resourceId: resolvedParams.updateId,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        scheduled_for: scheduledFor,
        recipient_count: dispatchDecisions.length,
        channels: requestedChannels,
        email_blocked_count: blockedEmailCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        updateId: resolvedParams.updateId,
        status: "scheduled",
        scheduledFor,
        recipientCount: dispatchDecisions.length,
        delivery: {
          channels: requestedChannels,
          emailBlockedCount: blockedEmailCount,
        },
      },
    });
  } catch (error) {
    console.error("Error in update schedule POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
