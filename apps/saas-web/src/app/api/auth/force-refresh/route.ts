import { NextRequest, NextResponse } from "next/server";

// POST /api/auth/force-refresh
// Forces a complete Kinde session refresh by redirecting through auth flow.
export async function POST(request: NextRequest) {
  try {
    console.log("[auth/force-refresh] Forcing complete session refresh");

    const body = (await request.json().catch(() => ({}))) as { returnUrl?: string };
    const raw = typeof body.returnUrl === "string" ? body.returnUrl : "";

    // Only allow relative paths to prevent open redirect attacks
    if (!raw || !raw.startsWith("/") || raw.includes("://")) {
      return NextResponse.json({ error: "Invalid returnUrl" }, { status: 400 });
    }
    const returnUrl = raw;

    // Force a fresh auth path, attempt silent refresh first.
    const authUrl = new URL("/api/auth/login", request.url);
    authUrl.searchParams.set("post_login_redirect_url", returnUrl);
    authUrl.searchParams.set("prompt", "none");

    return NextResponse.json({
      success: true,
      redirectUrl: authUrl.toString(),
      message: "Redirect to refresh session",
    });
  } catch (error) {
    console.error("[auth/force-refresh] Failed", error);
    return NextResponse.json(
      { error: "Force session refresh failed" },
      { status: 500 }
    );
  }
}
