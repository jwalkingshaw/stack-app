import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  appendUpdateActivity,
  loadExistingUpdateRecipients,
  markRecipientsNotified,
  resolvePartnerEmailTargets,
  sendUpdateEmails,
  setPublishedUpdateState,
} from "../../../[tenant]/updates/_delivery";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const SCHEDULER_ACTOR_USER_ID = "system:scheduler";
const supabase = supabaseServer;

function getSchedulerToken(request: NextRequest): string {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return (request.headers.get("x-updates-scheduler-secret") || "").trim();
}

function getBatchSize(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(raw)));
}

// POST /api/internal/updates/scheduled
// Runs due scheduled updates and publishes them.
export async function POST(request: NextRequest) {
  try {
    const configuredSecret = (process.env.UPDATES_SCHEDULER_SECRET || "").trim();
    if (!configuredSecret) {
      return NextResponse.json(
        { error: "UPDATES_SCHEDULER_SECRET is not configured" },
        { status: 500 }
      );
    }

    const receivedToken = getSchedulerToken(request);
    if (!receivedToken || receivedToken !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const batchSize = getBatchSize(body.limit);
    const nowIso = new Date().toISOString();

    const { data: dueRows, error: dueError } = await supabase
      .from("partner_updates")
      .select("id,organization_id,title,summary,urgency,status,due_at,scheduled_for,published_at")
      .eq("status", "scheduled")
      .not("scheduled_for", "is", null)
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(batchSize);

    if (dueError) {
      return NextResponse.json(
        { error: "Failed to load due scheduled updates" },
        { status: 500 }
      );
    }

    const dueUpdates = (dueRows || []) as Array<{
      id: string | null;
      organization_id: string | null;
      title: string | null;
      summary: string | null;
      urgency: string | null;
      status: string | null;
      due_at: string | null;
      scheduled_for: string | null;
      published_at: string | null;
    }>;

    const orgIdentityCache = new Map<string, { name: string | null; slug: string | null }>();
    let publishedCount = 0;
    let skippedCount = 0;
    let emailSentCount = 0;
    let emailFailedCount = 0;
    const results: Array<{
      updateId: string;
      organizationId: string;
      status: "published" | "skipped" | "failed";
      recipientCount: number;
      emailSentCount: number;
      emailFailedCount: number;
      reason?: string;
    }> = [];

    for (const row of dueUpdates) {
      if (!row.id || !row.organization_id) continue;
      const updateId = String(row.id);
      const organizationId = String(row.organization_id);

      const recipients = await loadExistingUpdateRecipients({
        organizationId,
        updateId,
      });
      const recipientIds = Array.from(
        new Set(recipients.map((recipient) => recipient.partnerOrganizationId))
      );

      const publishState = await setPublishedUpdateState({
        organizationId,
        updateId,
        userId: SCHEDULER_ACTOR_USER_ID,
      });

      if (!publishState.ok) {
        // Expected if another worker already published this update.
        if (publishState.status === 400) {
          skippedCount += 1;
          results.push({
            updateId,
            organizationId,
            status: "skipped",
            recipientCount: recipientIds.length,
            emailSentCount: 0,
            emailFailedCount: 0,
            reason: publishState.error,
          });
          continue;
        }

        results.push({
          updateId,
          organizationId,
          status: "failed",
          recipientCount: recipientIds.length,
          emailSentCount: 0,
          emailFailedCount: 0,
          reason: publishState.error,
        });
        continue;
      }

      publishedCount += 1;
      const publishedAt = new Date().toISOString();

      await appendUpdateActivity({
        organizationId,
        updateId,
        actorUserId: SCHEDULER_ACTOR_USER_ID,
        rows: [
          {
            eventType: "published",
            metadata: {
              trigger: "scheduler",
              recipient_count: recipientIds.length,
            },
            eventAt: publishedAt,
          },
          ...recipientIds.map((partnerOrganizationId) => ({
            partnerOrganizationId,
            eventType: "notification_sent",
            metadata: {
              channel: "in_app",
              trigger: "scheduler",
            },
            eventAt: publishedAt,
          })),
        ],
      });

      let updateEmailSentCount = 0;
      let updateEmailFailedCount = 0;
      const emailEligiblePartnerIds = Array.from(
        new Set(
          recipients
            .filter((recipient) => recipient.deliveryChannels.includes("email"))
            .map((recipient) => recipient.partnerOrganizationId)
        )
      );

      if (emailEligiblePartnerIds.length > 0) {
        const emailTargets = await resolvePartnerEmailTargets({
          partnerOrganizationIds: emailEligiblePartnerIds,
        });

        let orgIdentity = orgIdentityCache.get(organizationId);
        if (!orgIdentity) {
          const { data: organizationRaw } = await supabase
            .from("organizations")
            .select("name,slug")
            .eq("id", organizationId)
            .maybeSingle();
          const organization = organizationRaw as { name?: string | null; slug?: string | null } | null;
          orgIdentity = {
            name: organization?.name ? String(organization.name) : null,
            slug: organization?.slug ? String(organization.slug) : null,
          };
          orgIdentityCache.set(organizationId, orgIdentity);
        }

        const emailOutcomes = await sendUpdateEmails({
          brandLabel: orgIdentity.name || orgIdentity.slug || organizationId,
          brandTenantSlug: orgIdentity.slug || organizationId,
          update: {
            id: updateId,
            title: String(row.title || ""),
            summary: row.summary ? String(row.summary) : null,
            urgency: String(row.urgency || "normal"),
            status: "published",
            due_at: row.due_at ? String(row.due_at) : null,
            scheduled_for: row.scheduled_for ? String(row.scheduled_for) : null,
            published_at: publishedAt,
          },
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
            updateEmailSentCount += 1;
            emailActivities.push({
              partnerOrganizationId: outcome.partnerOrganizationId,
              eventType: "notification_sent",
              metadata: {
                channel: "email",
                trigger: "scheduler",
                provider_message_id: outcome.providerMessageId || null,
              },
            });
          } else {
            updateEmailFailedCount += 1;
            emailActivities.push({
              partnerOrganizationId: outcome.partnerOrganizationId,
              eventType: "notification_failed",
              metadata: {
                channel: "email",
                trigger: "scheduler",
                reason: outcome.errorReason || "provider_error",
              },
            });
          }
        }

        await appendUpdateActivity({
          organizationId,
          updateId,
          actorUserId: SCHEDULER_ACTOR_USER_ID,
          rows: emailActivities,
        });
      }

      await markRecipientsNotified({
        organizationId,
        updateId,
        partnerOrganizationIds: recipientIds,
      });

      emailSentCount += updateEmailSentCount;
      emailFailedCount += updateEmailFailedCount;
      results.push({
        updateId,
        organizationId,
        status: "published",
        recipientCount: recipientIds.length,
        emailSentCount: updateEmailSentCount,
        emailFailedCount: updateEmailFailedCount,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        now: nowIso,
        dueCount: dueUpdates.length,
        publishedCount,
        skippedCount,
        failedCount: results.filter((row) => row.status === "failed").length,
        emailSentCount,
        emailFailedCount,
        results,
      },
    });
  } catch (error) {
    console.error("Error in scheduled update processor:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
