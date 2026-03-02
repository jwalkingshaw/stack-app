import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import {
  BILLING_PLAN_CATALOG,
  getOrganizationBillingLimits,
  getOrganizationUsageSnapshot,
} from "@/lib/billing-policy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const permissions = await authService.getUserPermissions(user.id, organization.id);
    if (!permissions?.is_owner && !permissions?.is_admin) {
      return NextResponse.json(
        { error: "Only owners or admins can view billing settings" },
        { status: 403 }
      );
    }

    const { data: subscriptionRow, error: subscriptionError } = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select(`
        id,
        plan_id,
        status,
        trial_end,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
      `)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) {
      console.error("Failed to load organization subscription row:", subscriptionError);
    }

    const [{ planId, limits }, usage] = await Promise.all([
      getOrganizationBillingLimits(organization.id),
      getOrganizationUsageSnapshot(organization.id),
    ]);
    const resolvedPlanId = (subscriptionRow?.plan_id || planId) as (typeof BILLING_PLAN_CATALOG)[number]["id"];
    const currentPlan =
      BILLING_PLAN_CATALOG.find((plan) => plan.id === resolvedPlanId) || BILLING_PLAN_CATALOG[0];

    const fallbackSubscription = {
      id: `sub_${organization.id}`,
      organizationId: organization.id,
      planId: resolvedPlanId,
      status: 'active' as const,
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: organization.createdAt,
      updatedAt: organization.createdAt,
    };

    const derivedSubscription = subscriptionRow
      ? {
          id: subscriptionRow.id,
          organizationId: organization.id,
          planId: subscriptionRow.plan_id,
          status: subscriptionRow.status,
          currentPeriodStart: subscriptionRow.current_period_start,
          currentPeriodEnd: subscriptionRow.current_period_end,
          cancelAtPeriodEnd: subscriptionRow.cancel_at_period_end,
          trialEnd: subscriptionRow.trial_end,
          createdAt: subscriptionRow.created_at,
          updatedAt: subscriptionRow.updated_at,
        }
      : fallbackSubscription;

    return NextResponse.json({
      subscription: derivedSubscription,
      plan: currentPlan,
      usage: {
        organizationId: organization.id,
        period: new Date().toISOString().slice(0, 7), // YYYY-MM
        storageUsed: organization.storageUsed,
        storageLimitGb: limits.storageGb,
        activeSkuCount: usage.activeSkuCount,
        internalUserCount: usage.internalUserCount,
        partnerInviteCount: usage.partnerInviteCount,
        assetsCount: 0,
        deliveryBandwidthGb: 0,
        uploadsCount: 0, // Would need analytics
      }
    });
  } catch (error) {
    console.error("Failed to get subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const permissions = await authService.getUserPermissions(user.id, organization.id);
    if (!permissions?.is_owner && !permissions?.is_admin) {
      return NextResponse.json(
        { error: "Only owners or admins can change billing plans" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const planId = String(body?.planId || "").trim().toLowerCase();
    const useTrial = Boolean(body?.trial);
    const trialDaysRaw = Number(body?.trialDays);
    const trialDays = Number.isFinite(trialDaysRaw)
      ? Math.max(1, Math.min(30, Math.floor(trialDaysRaw)))
      : 14;
    const providerCustomerId = body?.providerCustomerId
      ? String(body.providerCustomerId).trim()
      : null;
    const providerSubscriptionId = body?.providerSubscriptionId
      ? String(body.providerSubscriptionId).trim()
      : null;
    const changeSource = body?.source ? String(body.source).trim() : "manual";

    const plan = BILLING_PLAN_CATALOG.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextPeriodEnd = new Date(now);
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const targetStatus = useTrial ? "trialing" : "active";

    const { data: currentRows, error: currentRowsError } = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select("id,plan_id,status")
      .eq("organization_id", organization.id)
      .in("status", ["trialing", "active", "past_due", "incomplete"])
      .order("created_at", { ascending: false });

    if (currentRowsError) {
      console.error("Failed to read active organization subscriptions:", currentRowsError);
      return NextResponse.json(
        { error: "Could not update subscription" },
        { status: 500 }
      );
    }

    const activeRows = (currentRows || []) as Array<any>;
    const existingEquivalent = activeRows.find(
      (row) => row.plan_id === plan.id && row.status === targetStatus
    );
    if (existingEquivalent) {
      return NextResponse.json({
        message: "Subscription already matches requested plan",
        selectedPlanId: plan.id,
        subscriptionId: existingEquivalent.id,
        redirectUrl: `/dashboard/${resolvedParams.slug}/billing?success=true`,
      });
    }

    if (activeRows.length > 0) {
      const activeIds = activeRows.map((row) => row.id);
      const { error: cancelExistingError } = await (supabaseServer as any)
        .from("organization_subscriptions")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          cancel_at_period_end: false,
          current_period_end: nowIso,
          updated_at: nowIso,
        })
        .in("id", activeIds);

      if (cancelExistingError) {
        console.error("Failed to cancel existing subscriptions:", cancelExistingError);
        return NextResponse.json(
          { error: "Could not update subscription" },
          { status: 500 }
        );
      }
    }

    const subscriptionInsertPayload = {
      organization_id: organization.id,
      plan_id: plan.id,
      status: targetStatus,
      trial_start: useTrial ? nowIso : null,
      trial_end: useTrial ? trialEnd.toISOString() : null,
      current_period_start: nowIso,
      current_period_end: useTrial ? trialEnd.toISOString() : nextPeriodEnd.toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
      provider: "kinde",
      provider_customer_id: providerCustomerId,
      provider_subscription_id: providerSubscriptionId,
      created_by: user.id,
      updated_at: nowIso,
    };

    const { data: insertedSubscription, error: subscriptionInsertError } = await (supabaseServer as any)
      .from("organization_subscriptions")
      .insert(subscriptionInsertPayload)
      .select("id,plan_id,status,current_period_start,current_period_end,trial_end,created_at,updated_at")
      .single();

    if (subscriptionInsertError) {
      console.error("Failed to insert organization subscription:", subscriptionInsertError);
      return NextResponse.json(
        { error: "Could not update subscription" },
        { status: 500 }
      );
    }

    const { error: billingEventError } = await (supabaseServer as any)
      .from("organization_billing_events")
      .insert({
        organization_id: organization.id,
        event_type: "subscription.updated.manual",
        actor_user_id: user.id,
        payload: {
          source: changeSource,
          plan_id: plan.id,
          status: targetStatus,
          trial_days: useTrial ? trialDays : 0,
          provider_customer_id: providerCustomerId,
          provider_subscription_id: providerSubscriptionId,
        },
      });

    if (billingEventError) {
      console.error("Failed to insert organization_billing_events row:", billingEventError);
    }

    return NextResponse.json({
      message: "Subscription updated",
      selectedPlanId: plan.id,
      subscription: insertedSubscription,
      redirectUrl: `/dashboard/${resolvedParams.slug}/billing?success=true`,
    });
  } catch (error) {
    console.error("Failed to update subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
