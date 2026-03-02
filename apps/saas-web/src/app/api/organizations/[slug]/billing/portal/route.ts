import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";

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
        { error: "Only owners or admins can manage billing settings" },
        { status: 403 }
      );
    }

    const { getPermission } = getKindeServerSession();
    const billingPermission = await getPermission("org:write:billing");
    if (!billingPermission?.isGranted) {
      return NextResponse.json(
        {
          error:
            "Your account is missing the Kinde billing permission for this organization.",
          code: "KINDE_BILLING_PERMISSION_REQUIRED",
          requiredPermission: "org:write:billing",
        },
        { status: 403 }
      );
    }

    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/${resolvedParams.slug}/settings/billing`;
    const portalUrl =
      `/api/auth/portal?subNav=organization_billing&returnUrl=${encodeURIComponent(returnUrl)}`;

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
