import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-audit";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUpdatesContext } from "../../_shared";
import {
  appendUpdateActivity,
  buildRecipientDispatchDecisions,
  getUpdateForDelivery,
  markRecipientsNotified,
  normalizeDeliveryChannels,
  normalizeRecipientSelection,
  resolvePartnerEmailTargets,
  resolveRecipientOrganizations,
  sendUpdateEmails,
  setPublishedUpdateState,
  upsertPartnerUpdateRecipients,
  validateRecipientKitAccess,
} from "../../_delivery";

// POST /api/[tenant]/updates/[updateId]/publish
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
        { error: "Update is already published" },
        { status: 400 }
      );
    }
    if (loadedUpdate.update.status === "archived" || loadedUpdate.update.status === "canceled") {
      return NextResponse.json(
        { error: "Archived or canceled updates cannot be published" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
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

    const publishState = await setPublishedUpdateState({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      userId: access.context.userId,
    });
    if (!publishState.ok) {
      return NextResponse.json({ error: publishState.error }, { status: publishState.status });
    }

    const publishedAt = new Date().toISOString();
    const publishActivities: Array<{
      partnerOrganizationId?: string | null;
      eventType: string;
      metadata?: Record<string, unknown>;
      eventAt?: string;
    }> = [
      {
        eventType: "published",
        metadata: {
          recipient_count: dispatchDecisions.length,
          requested_channels: requestedChannels,
        },
        eventAt: publishedAt,
      },
      ...dispatchDecisions.map((recipient) => ({
        partnerOrganizationId: recipient.partnerOrganizationId,
        eventType: "notification_sent",
        metadata: {
          channel: "in_app",
          trigger: "publish",
          consent: recipient.consent,
        },
        eventAt: publishedAt,
      })),
    ];

    let blockedEmailCount = 0;
    if (requestedChannels.includes("email")) {
      for (const recipient of dispatchDecisions) {
        if (recipient.consent.email.allowed) continue;
        blockedEmailCount += 1;
        publishActivities.push({
          partnerOrganizationId: recipient.partnerOrganizationId,
          eventType: "notification_failed",
          metadata: {
            channel: "email",
            reason: "consent_blocked",
            consent: recipient.consent.email,
            trigger: "publish",
          },
          eventAt: publishedAt,
        });
      }
    }

    await appendUpdateActivity({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      actorUserId: access.context.userId,
      rows: publishActivities,
    });

    let emailSentCount = 0;
    let emailFailedCount = 0;
    if (requestedChannels.includes("email")) {
      const emailEligiblePartnerIds = dispatchDecisions
        .filter((recipient) => recipient.deliveryChannels.includes("email"))
        .map((recipient) => recipient.partnerOrganizationId);

      const emailTargets = await resolvePartnerEmailTargets({
        partnerOrganizationIds: emailEligiblePartnerIds,
      });

      const { data: organization } = await getSupabaseServer()
        .from("organizations")
        .select("name,slug")
        .eq("id", access.context.organizationId)
        .maybeSingle();

      const emailOutcomes = await sendUpdateEmails({
        brandLabel:
          (organization?.name && String(organization.name)) || access.context.tenantSlug,
        brandTenantSlug:
          (organization?.slug && String(organization.slug)) || access.context.tenantSlug,
        update: loadedUpdate.update,
        recipients: emailTargets,
        isReminder: false,
      });

      const emailActivities: Array<{
        partnerOrganizationId?: string | null;
        eventType: string;
        metadata?: Record<string, unknown>;
      }> = [];

      for (const outcome of emailOutcomes) {
        if (outcome.success) {
          emailSentCount += 1;
          emailActivities.push({
            partnerOrganizationId: outcome.partnerOrganizationId,
            eventType: "notification_sent",
            metadata: {
              channel: "email",
              trigger: "publish",
              provider_message_id: outcome.providerMessageId || null,
            },
          });
        } else {
          emailFailedCount += 1;
          emailActivities.push({
            partnerOrganizationId: outcome.partnerOrganizationId,
            eventType: "notification_failed",
            metadata: {
              channel: "email",
              trigger: "publish",
              reason: outcome.errorReason || "provider_error",
            },
          });
        }
      }

      await appendUpdateActivity({
        organizationId: access.context.organizationId,
        updateId: resolvedParams.updateId,
        actorUserId: access.context.userId,
        rows: emailActivities,
      });
    }

    await markRecipientsNotified({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      partnerOrganizationIds: dispatchDecisions.map((recipient) => recipient.partnerOrganizationId),
    });

    await logSecurityEvent(getSupabaseServer(), {
      organizationId: access.context.organizationId,
      actorUserId: access.context.userId,
      action: "partner_update.publish",
      resourceType: "partner_update",
      resourceId: resolvedParams.updateId,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        recipient_count: dispatchDecisions.length,
        channels: requestedChannels,
        email_sent_count: emailSentCount,
        email_failed_count: emailFailedCount,
        email_blocked_count: blockedEmailCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        updateId: resolvedParams.updateId,
        status: "published",
        recipientCount: dispatchDecisions.length,
        delivery: {
          channels: requestedChannels,
          emailSentCount,
          emailFailedCount,
          emailBlockedCount: blockedEmailCount,
        },
      },
    });
  } catch (error) {
    console.error("Error in update publish POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
