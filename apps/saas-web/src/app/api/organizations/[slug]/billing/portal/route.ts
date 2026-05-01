import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { kindeAPI } from "@/lib/kinde-management";

const KINDE_PRICING_TABLE_KEY = "organization_plans";

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
        { error: "Only owners or admins can manage billing settings" },
        { status: 403 }
      );
    }

    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/${resolvedParams.slug}/settings/billing`;
    const kindeOrgId = (organization as { kindeOrgId?: string }).kindeOrgId;

    // Check if the org has an active paid subscription
    const { data: subscriptionRow } = await getSupabaseServer()
      .from("organization_subscriptions")
      .select("plan_id, status")
      .eq("organization_id", organization.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFreePlan = !subscriptionRow || subscriptionRow.plan_id === "free";

    let portalUrl: string;

    if (isFreePlan) {
      // Free orgs: redirect through Kinde auth with pricing_table_key so Kinde
      // shows the plan selector during authentication, then returns to billing.
      const authParams = new URLSearchParams({
        ...(kindeOrgId ? { org_code: kindeOrgId } : {}),
        pricing_table_key: KINDE_PRICING_TABLE_KEY,
        post_login_redirect_url: returnUrl,
      });
      portalUrl = `/api/auth/login?${authParams.toString()}`;
    } else {
      // Paid orgs: use Kinde Management API to open the subscription management portal.
      portalUrl = await kindeAPI.generatePortalUrl({
        userId: user.id,
        organizationCode: kindeOrgId || undefined,
        returnUrl,
        subNav: "organization_billing",
      });
    }

    return NextResponse.json({ ok: true, portalUrl });
  } catch (error) {
    console.error("Failed to generate billing portal URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
