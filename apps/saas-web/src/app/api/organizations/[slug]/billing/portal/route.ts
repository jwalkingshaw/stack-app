import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";

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

    // Build the Kinde portal URL scoped to the correct org
    const portalDestination = `/api/auth/portal?subNav=organization_plan_selection&returnUrl=${encodeURIComponent(returnUrl)}`;

    // Force a token refresh scoped to this org before opening the portal,
    // so Kinde sees the org:write:billing permission in the correct org context
    const portalUrl = kindeOrgId
      ? `/api/auth/login?org_code=${encodeURIComponent(kindeOrgId)}&post_login_redirect_url=${encodeURIComponent(portalDestination)}`
      : portalDestination;

    return NextResponse.json({
      ok: true,
      portalUrl,
    });
  } catch (error) {
    console.error("Failed to build billing portal URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
