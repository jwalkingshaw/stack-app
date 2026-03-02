import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  extractKindeBillingRefs,
  KindeBillingRefs,
  verifyKindeWebhookJwt,
  VerifiedKindeWebhookEvent,
} from "@/lib/kinde-billing-webhooks";

const PROVIDER = "kinde";
const RETRYABLE_EVENT_STATUSES = new Set(["received", "failed"]);

type ReceiptStatus = "received" | "processed" | "ignored" | "failed";

type ReceiptRow = {
  id: string;
  status: ReceiptStatus;
  attempt_count: number;
  organization_id: string | null;
};

function isUuid(value: string | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function inferStatusFromEventType(eventType: string): KindeBillingRefs["status"] {
  const key = eventType.toLowerCase();
  if (key.includes("payment_failed") || key.includes("invoice_overdue")) {
    return "past_due";
  }
  if (key.includes("cancel")) {
    return "canceled";
  }
  if (key.includes("agreement_created")) {
    return "active";
  }
  if (key.includes("plan_assigned") || key.includes("plan_changed") || key.includes("payment_succeeded")) {
    return "active";
  }
  return undefined;
}

function shouldTouchSubscription(eventType: string): boolean {
  const key = eventType.toLowerCase();
  return (
    key.includes("agreement_created") ||
    key.includes("plan_assigned") ||
    key.includes("plan_changed") ||
    key.includes("agreement_cancelled") ||
    key.includes("agreement_canceled") ||
    key.includes("payment_succeeded") ||
    key.includes("payment_failed") ||
    key.includes("invoice_overdue")
  );
}

async function resolveOrganizationId(refs: KindeBillingRefs): Promise<string | null> {
  if (refs.organizationId && !isUuid(refs.organizationId)) {
    const byKindeOrgId = await (supabaseServer as any)
      .from("organizations")
      .select("id")
      .eq("kinde_org_id", refs.organizationId)
      .maybeSingle();

    if (!byKindeOrgId.error && byKindeOrgId.data?.id) {
      return byKindeOrgId.data.id;
    }
  }

  if (isUuid(refs.organizationId)) {
    const orgLookup = await (supabaseServer as any)
      .from("organizations")
      .select("id")
      .eq("id", refs.organizationId)
      .maybeSingle();

    if (!orgLookup.error && orgLookup.data?.id) {
      return orgLookup.data.id;
    }
  }

  if (refs.providerSubscriptionId) {
    const bySubscription = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("provider", PROVIDER)
      .eq("provider_subscription_id", refs.providerSubscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!bySubscription.error && bySubscription.data?.organization_id) {
      return bySubscription.data.organization_id;
    }
  }

  if (refs.providerCustomerId) {
    const byCustomer = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("provider", PROVIDER)
      .eq("provider_customer_id", refs.providerCustomerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!byCustomer.error && byCustomer.data?.organization_id) {
      return byCustomer.data.organization_id;
    }
  }

  return null;
}

async function findExistingReceipt(eventId: string): Promise<ReceiptRow | null> {
  const { data, error } = await (supabaseServer as any)
    .from("billing_webhook_receipts")
    .select("id,status,attempt_count,organization_id")
    .eq("provider", PROVIDER)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("Failed to lookup billing webhook receipt:", error);
    throw new Error("Unable to lookup billing webhook receipt");
  }
  return (data as ReceiptRow | null) ?? null;
}

async function reserveReceipt(event: VerifiedKindeWebhookEvent): Promise<{
  duplicate: boolean;
  receiptId?: string;
}> {
  const existing = await findExistingReceipt(event.eventId);
  if (existing && !RETRYABLE_EVENT_STATUSES.has(existing.status)) {
    return { duplicate: true, receiptId: existing.id };
  }

  const nowIso = new Date().toISOString();

  if (existing) {
    const { error } = await (supabaseServer as any)
      .from("billing_webhook_receipts")
      .update({
        status: "received",
        event_type: event.eventType,
        payload: event.payload,
        error_message: null,
        attempt_count: Number(existing.attempt_count || 1) + 1,
        last_attempt_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (error) {
      console.error("Failed to reserve existing billing webhook receipt:", error);
      throw new Error("Unable to reserve billing webhook receipt");
    }

    return { duplicate: false, receiptId: existing.id };
  }

  const { data, error } = await (supabaseServer as any)
    .from("billing_webhook_receipts")
    .insert({
      provider: PROVIDER,
      event_id: event.eventId,
      event_type: event.eventType,
      status: "received",
      payload: event.payload,
      last_attempt_at: nowIso,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { duplicate: true };
    }
    console.error("Failed to create billing webhook receipt:", error);
    throw new Error("Unable to create billing webhook receipt");
  }

  return { duplicate: false, receiptId: data.id };
}

async function completeReceipt(params: {
  receiptId: string;
  status: ReceiptStatus;
  organizationId?: string | null;
  errorMessage?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: params.status,
    updated_at: nowIso,
  };

  if (params.status === "processed" || params.status === "ignored") {
    payload.processed_at = nowIso;
  }
  if (typeof params.organizationId !== "undefined") {
    payload.organization_id = params.organizationId;
  }
  if (typeof params.errorMessage !== "undefined") {
    payload.error_message = params.errorMessage;
  }

  const { error } = await (supabaseServer as any)
    .from("billing_webhook_receipts")
    .update(payload)
    .eq("id", params.receiptId);

  if (error) {
    console.error("Failed to finalize billing webhook receipt:", error);
  }
}

async function writeBillingEventLog(params: {
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await (supabaseServer as any)
    .from("organization_billing_events")
    .insert({
      organization_id: params.organizationId,
      event_type: `kinde.${params.eventType}`,
      actor_user_id: "system:kinde_webhook",
      payload: params.payload,
    });

  if (error) {
    console.error("Failed to insert organization_billing_events row:", error);
  }
}

async function upsertOrganizationSubscription(params: {
  organizationId: string;
  refs: KindeBillingRefs;
  eventType: string;
}) {
  const nowIso = new Date().toISOString();
  const status = params.refs.status || inferStatusFromEventType(params.eventType) || "active";

  const existingByProviderSub =
    params.refs.providerSubscriptionId
      ? await (supabaseServer as any)
          .from("organization_subscriptions")
          .select("id,plan_id")
          .eq("provider", PROVIDER)
          .eq("provider_subscription_id", params.refs.providerSubscriptionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

  if (existingByProviderSub.error) {
    console.error("Failed to find existing provider subscription row:", existingByProviderSub.error);
  }

  let existingSubscription = existingByProviderSub.data as { id: string; plan_id: string | null } | null;

  if (!existingSubscription && params.refs.providerCustomerId) {
    const existingByCustomer = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select("id,plan_id")
      .eq("provider", PROVIDER)
      .eq("provider_customer_id", params.refs.providerCustomerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByCustomer.error) {
      console.error("Failed to find existing customer subscription row:", existingByCustomer.error);
    } else if (existingByCustomer.data?.id) {
      existingSubscription = existingByCustomer.data as { id: string; plan_id: string | null };
    }
  }

  const resolvedPlanId = params.refs.planId || existingSubscription?.plan_id || null;
  if (!resolvedPlanId) {
    console.warn(
      "Skipping subscription upsert because plan_id could not be resolved from webhook payload or existing rows",
      {
        organizationId: params.organizationId,
        eventType: params.eventType,
        providerSubscriptionId: params.refs.providerSubscriptionId || null,
      }
    );
    return;
  }

  const subscriptionId = existingSubscription?.id as string | undefined;
  const writePayload = {
    organization_id: params.organizationId,
    plan_id: resolvedPlanId,
    status,
    trial_start: params.refs.trialStart || null,
    trial_end: params.refs.trialEnd || null,
    current_period_start: params.refs.currentPeriodStart || null,
    current_period_end: params.refs.currentPeriodEnd || null,
    cancel_at_period_end: params.refs.cancelAtPeriodEnd || false,
    canceled_at: status === "canceled" ? params.refs.canceledAt || nowIso : null,
    provider: PROVIDER,
    provider_customer_id: params.refs.providerCustomerId || null,
    provider_subscription_id: params.refs.providerSubscriptionId || null,
    created_by: "system:kinde_webhook",
    updated_at: nowIso,
  };

  if (subscriptionId) {
    const { error } = await (supabaseServer as any)
      .from("organization_subscriptions")
      .update(writePayload)
      .eq("id", subscriptionId);

    if (error) {
      console.error("Failed to update organization subscription from webhook:", error);
    }
    return;
  }

  const { error } = await (supabaseServer as any)
    .from("organization_subscriptions")
    .insert(writePayload);

  if (error) {
    console.error("Failed to insert organization subscription from webhook:", error);
  }
}

export async function POST(request: NextRequest) {
  const rawToken = await request.text();
  const verified = await verifyKindeWebhookJwt(rawToken);

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  const reserved = await reserveReceipt(verified.event);
  if (reserved.duplicate) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  if (!reserved.receiptId) {
    return NextResponse.json({ error: "Unable to reserve receipt" }, { status: 500 });
  }

  const receiptId = reserved.receiptId;

  try {
    const refs = extractKindeBillingRefs(verified.event);
    const organizationId = await resolveOrganizationId(refs);

    if (!organizationId) {
      await completeReceipt({
        receiptId,
        status: "ignored",
        errorMessage: "No organization mapping could be resolved",
      });
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: "organization_not_resolved",
      });
    }

    await writeBillingEventLog({
      organizationId,
      eventType: verified.event.eventType,
      payload: {
        event_id: verified.event.eventId,
        event_type: verified.event.eventType,
        refs,
        payload: verified.event.payload,
      },
    });

    if (shouldTouchSubscription(verified.event.eventType)) {
      await upsertOrganizationSubscription({
        organizationId,
        refs,
        eventType: verified.event.eventType,
      });
    }

    await completeReceipt({
      receiptId,
      status: "processed",
      organizationId,
      errorMessage: null,
    });

    return NextResponse.json({
      success: true,
      eventId: verified.event.eventId,
      eventType: verified.event.eventType,
    });
  } catch (error) {
    console.error("Failed to process Kinde billing webhook:", error);
    await completeReceipt({
      receiptId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown processing error",
    });

    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
