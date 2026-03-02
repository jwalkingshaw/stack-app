import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { BILLING_PLAN_CATALOG, getOrganizationBillingLimits } from "@/lib/billing-policy";

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
        { error: "Only owners or admins can view billing plans" },
        { status: 403 }
      );
    }

    const { planId } = await getOrganizationBillingLimits(organization.id);
    return NextResponse.json({
      plans: BILLING_PLAN_CATALOG,
      currentPlanId: planId,
    });
  } catch (error) {
    console.error("Failed to get plans:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
