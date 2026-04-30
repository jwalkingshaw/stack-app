import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-audit";
import { getSupabaseServer } from "@/lib/supabase";
import { normalizeUuidArray, requireUpdatesContext } from "../../_shared";
import {
  appendUpdateActivity,
  buildRecipientDispatchDecisions,
  getUpdateForDelivery,
  loadExistingUpdateRecipients,
  markRecipientsNotified,
  normalizeDeliveryChannels,
  resolvePartnerEmailTargets,
  sendUpdateEmails,
  validateRecipientKitAccess,
} from "../../_delivery";

// POST /api/[tenant]/updates/[updateId]/remind
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

    if (loadedUpdate.update.status !== "published") {
      return NextResponse.json(
        { error: "Only published updates can send reminders" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const selectedPartnerOrganizationIds = normalizeUuidArray(
      body.partnerOrganizationIds || body.partner_organization_ids
    );
    const requestedChannels = normalizeDeliveryChannels(
      body.deliveryChannels || body.delivery_channels || ["in_app", "email"]
    );

    const existingRecipients = await loadExistingUpdateRecipients({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      partnerOrganizationIds: selectedPartnerOrganizationIds,
    });
    if (existingRecipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients found for this reminder request" },
        { status: 404 }
      );
    }

    const kitAccessValidation = await validateRecipientKitAccess({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      partnerOrganizationIds: existingRecipients.map((recipient) => recipient.partnerOrganizationId),
    });
    if (!kitAccessValidation.ok) {
      return NextResponse.json(
        { error: kitAccessValidation.error, blockedRecipients: kitAccessValidation.blockedRecipients },
        { status: kitAccessValidation.status }
      );
    }

    const dispatchDecisions = await buildRecipientDispatchDecisions({
      organizationId: access.context.organizationId,
      partnerOrganizationIds: existingRecipients.map((recipient) => recipient.partnerOrganizationId),
      requestedChannels,
    });
    const decisionsByPartner = new Map(
      dispatchDecisions.map((recipient) => [recipient.partnerOrganizationId, recipient])
    );

    const reminderActivities: Array<{
      partnerOrganizationId?: string | null;
      eventType: string;
      metadata?: Record<string, unknown>;
    }> = [];
    let blockedEmailCount = 0;

    for (const recipient of existingRecipients) {
      const decision = decisionsByPartner.get(recipient.partnerOrganizationId);
      if (!decision) continue;

      reminderActivities.push({
        partnerOrganizationId: recipient.partnerOrganizationId,
        eventType: "reminder_sent",
        metadata: {
          channel: "in_app",
          trigger: "manual_reminder",
        },
      });

      if (requestedChannels.includes("email") && !decision.consent.email.allowed) {
        blockedEmailCount += 1;
        reminderActivities.push({
          partnerOrganizationId: recipient.partnerOrganizationId,
          eventType: "notification_failed",
          metadata: {
            channel: "email",
            reason: "consent_blocked",
            consent: decision.consent.email,
            trigger: "manual_reminder",
          },
        });
      }
    }

    await appendUpdateActivity({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      actorUserId: access.context.userId,
      rows: reminderActivities,
    });

    let emailSentCount = 0;
    let emailFailedCount = 0;
    if (requestedChannels.includes("email")) {
      const emailTargets = await resolvePartnerEmailTargets({
        partnerOrganizationIds: dispatchDecisions
          .filter((recipient) => recipient.deliveryChannels.includes("email"))
          .map((recipient) => recipient.partnerOrganizationId),
      });

      const { data: organization } = await getSupabaseServer()
        .from("organizations")
        .select("name,slug")
        .eq("id", access.context.organizationId)
        .maybeSingle();

      const outcomes = await sendUpdateEmails({
        brandLabel:
          (organization?.name && String(organization.name)) || access.context.tenantSlug,
        brandTenantSlug:
          (organization?.slug && String(organization.slug)) || access.context.tenantSlug,
        update: loadedUpdate.update,
        recipients: emailTargets,
        isReminder: true,
      });

      const emailActivities: Array<{
        partnerOrganizationId?: string | null;
        eventType: string;
        metadata?: Record<string, unknown>;
      }> = [];

      for (const outcome of outcomes) {
        if (outcome.success) {
          emailSentCount += 1;
          emailActivities.push({
            partnerOrganizationId: outcome.partnerOrganizationId,
            eventType: "reminder_sent",
            metadata: {
              channel: "email",
              trigger: "manual_reminder",
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
              trigger: "manual_reminder",
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
      partnerOrganizationIds: existingRecipients.map((recipient) => recipient.partnerOrganizationId),
    });

    await logSecurityEvent(getSupabaseServer(), {
      organizationId: access.context.organizationId,
      actorUserId: access.context.userId,
      action: "partner_update.remind",
      resourceType: "partner_update",
      resourceId: resolvedParams.updateId,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        recipient_count: existingRecipients.length,
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
        recipientCount: existingRecipients.length,
        delivery: {
          channels: requestedChannels,
          emailSentCount,
          emailFailedCount,
          emailBlockedCount: blockedEmailCount,
        },
      },
    });
  } catch (error) {
    console.error("Error in update remind POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
