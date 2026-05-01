import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_ID_STARTER,
  growth: process.env.STRIPE_PRICE_ID_GROWTH,
  scale: process.env.STRIPE_PRICE_ID_SCALE,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = new DatabaseQueries(getSupabaseServer());
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
        { error: "Only owners or admins can manage billing" },
        { status: 403 }
      );
    }

    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/${resolvedParams.slug}/settings/billing`;
    const requestedPlanId = new URL(request.url).searchParams.get("plan") ?? "";

    // Check for an active paid subscription
    const { data: subscriptionRow } = await getSupabaseServer()
      .from("organization_subscriptions")
      .select("plan_id, status, provider_customer_id")
      .eq("organization_id", organization.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFreePlan = !subscriptionRow || subscriptionRow.plan_id === "free";
    const stripeCustomerId = subscriptionRow?.provider_customer_id ?? null;

    let portalUrl: string;

    if (isFreePlan) {
      // Resolve which Stripe price to use — fall back to Growth as the default upgrade
      const planId = PLAN_PRICE_MAP[requestedPlanId] ? requestedPlanId : "growth";
      const priceId = PLAN_PRICE_MAP[planId];

      if (!priceId) {
        return NextResponse.json(
          { error: "Stripe price not configured. Add STRIPE_PRICE_ID_* env vars." },
          { status: 500 }
        );
      }

      const sessionParams: Parameters<typeof getStripe().checkout.sessions.create>[0] = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${returnUrl}?checkout=success`,
        cancel_url: returnUrl,
        client_reference_id: organization.id,
        metadata: { organizationId: organization.id, planId },
      };

      if (stripeCustomerId) {
        sessionParams.customer = stripeCustomerId;
      } else {
        sessionParams.customer_email = user.email;
      }

      const session = await getStripe().checkout.sessions.create(sessionParams);
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      portalUrl = session.url;
    } else {
      // Paid org — open Stripe Customer Portal to manage existing subscription
      if (!stripeCustomerId) {
        return NextResponse.json(
          { error: "No Stripe customer found for this organisation" },
          { status: 400 }
        );
      }

      const portalSession = await getStripe().billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
      portalUrl = portalSession.url;
    }

    return NextResponse.json({ ok: true, portalUrl });
  } catch (error) {
    console.error("Failed to create billing session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
