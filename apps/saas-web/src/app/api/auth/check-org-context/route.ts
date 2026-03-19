import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

// GET /api/auth/check-org-context
// Checks if the user's session has organization context.
export async function GET() {
  try {
    const { getUser, getOrganization, isAuthenticated } = getKindeServerSession();

    if (!(await isAuthenticated())) {
      return NextResponse.json(
        { authenticated: false, hasOrganization: false },
        { status: 200 }
      );
    }

    const user = await getUser();
    const organization = await getOrganization();
    const organizationName =
      typeof organization?.orgName === "string" ? organization.orgName : null;

    return NextResponse.json({
      authenticated: true,
      hasOrganization: Boolean(organization?.orgCode),
      user: user
        ? {
            id: user.id,
            email: user.email,
          }
        : null,
      organization: organization
        ? {
            orgCode: organization.orgCode,
            name: organizationName,
          }
        : null,
    });
  } catch (error) {
    console.error("[auth/check-org-context] Failed", error);
    return NextResponse.json(
      { error: "Failed to check session context" },
      { status: 500 }
    );
  }
}
