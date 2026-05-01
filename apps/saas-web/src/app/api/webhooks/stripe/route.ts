import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

// Use a service-role Supabase client — webhooks run outside user sessions
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

const STRIPE_PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_ID_STARTER ?? ""]: "starter",
  [process.env.STRIPE_PRICE_ID_GROWTH ?? ""]: "growth",
  [process.env.STRIPE_PRICE_ID_SCALE ?? ""]: "scale",
};

function planIdFromSubscription(subscription: Stripe.Subscription): string {
  const priceId = subscription.items.data[0]?.price?.id ?? "";
  return STRIPE_PRICE_TO_PLAN[priceId] ?? "free";
}

async function upsertSubscription(
  supabase: ReturnType<typeof getServiceSupabase>,
  organizationId: string,
  subscription: Stripe.Subscription,
  customerId: string
) {
  const planId = planIdFromSubscription(subscription);
  const now = new Date().toISOString();

  const payload = {
    organization_id: organizationId,
    plan_id: planId,
    status: subscription.status,
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: subscription.id,
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    // current_period_start/end were removed from Stripe.Subscription type in API v2026-03-25.dahlia
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current_period_start: (subscription as any).current_period_start
      ? new Date((subscription as any).current_period_start * 1000).toISOString()
      : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current_period_end: (subscription as any).current_period_end
      ? new Date((subscription as any).current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    updated_at: now,
  };

  // Cancel any other active rows for this org (different subscription ID)
  await supabase
    .from("organization_subscriptions")
    .update({ status: "canceled", canceled_at: now, updated_at: now })
    .eq("organization_id", organizationId)
    .neq("provider_subscription_id", subscription.id)
    .in("status", ["active", "trialing", "past_due", "incomplete"]);

  // Check if a row already exists for this subscription ID
  const { data: existing } = await supabase
    .from("organization_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("organization_subscriptions")
      .update(payload)
      .eq("id", existing.id);
    if (error) { console.error("Failed to update subscription:", error); throw error; }
  } else {
    const { error } = await supabase
      .from("organization_subscriptions")
      .insert(payload);
    if (error) { console.error("Failed to insert subscription:", error); throw error; }
  }
}

async function getOrgIdFromCustomer(
  supabase: ReturnType<typeof getServiceSupabase>,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("organization_subscriptions")
    .select("organization_id")
    .eq("provider_customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const organizationId =
          session.client_reference_id ??
          (session.metadata?.organizationId as string | undefined);

        if (!organizationId) {
          console.error("checkout.session.completed: missing organizationId", session.id);
          break;
        }

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await upsertSubscription(supabase, organizationId, subscription, customerId);
        console.log(`✅ Subscription created for org ${organizationId} — plan: ${planIdFromSubscription(subscription)}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const orgId = await getOrgIdFromCustomer(supabase, customerId);
        if (!orgId) {
          console.warn("customer.subscription.updated: org not found for customer", customerId);
          break;
        }
        await upsertSubscription(supabase, orgId, subscription, customerId);
        console.log(`✅ Subscription updated for org ${orgId} — status: ${subscription.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const now = new Date().toISOString();
        await supabase
          .from("organization_subscriptions")
          .update({ status: "canceled", canceled_at: now, updated_at: now })
          .eq("provider_subscription_id", subscription.id);
        console.log(`✅ Subscription ${subscription.id} marked canceled`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // In Stripe API v2026-03-25.dahlia, subscription moved to invoice.parent.subscription_details.subscription
        const subscriptionId = (
          (invoice.parent?.subscription_details?.subscription as string | null) ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((invoice as any).subscription as string | null)
        );
        if (subscriptionId) {
          await supabase
            .from("organization_subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("provider_subscription_id", subscriptionId);
          console.log(`⚠️ Payment failed for subscription ${subscriptionId}`);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
