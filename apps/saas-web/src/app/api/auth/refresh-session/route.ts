import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

// POST /api/auth/refresh-session
export async function POST() {
  try {
    const { getUser, getOrganization, isAuthenticated } = getKindeServerSession();

    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await getUser();
    const organization = await getOrganization();
    const organizationName =
      typeof organization?.orgName === "string" ? organization.orgName : null;

    const response = NextResponse.json({
      success: true,
      refreshed: true,
      user: user?.email,
      organization: organization
        ? {
            orgCode: organization.orgCode,
            name: organizationName,
          }
        : null,
    });

    // Force clients/proxies to bypass stale session caches.
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("X-Session-Refresh", "true");
    response.headers.set("Vary", "Cookie");

    return response;
  } catch (error) {
    console.error("[auth/refresh-session] Failed", error);
    return NextResponse.json(
      {
        error: "Session refresh failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET /api/auth/refresh-session - quick endpoint check.
export async function GET() {
  return NextResponse.json({
    message: "Use POST method to refresh session",
    endpoint: "/api/auth/refresh-session",
  });
}
