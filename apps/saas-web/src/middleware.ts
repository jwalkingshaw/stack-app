import { NextRequest, NextResponse } from "next/server";
import { isPublicRoute, isProtectedRoute, isTenantRoute } from "./lib/routes";

const RESERVED_SUBDOMAINS = new Set(["app", "www", "localhost", "dev"]);

function getTenantFromHost(
  host: string | null,
  baseDomain: string,
  appHost: string | null
): string | null {
  if (!host) return null;
  if (appHost && host === appHost) return null;
  if (host === baseDomain) return null;
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const subdomain = host.slice(0, -1 * (baseDomain.length + 1));
  if (!subdomain) return null;

  const tenant = subdomain.split(".")[0];
  if (!tenant || RESERVED_SUBDOMAINS.has(tenant)) return null;

  return tenant;
}

/**
 * Lightweight middleware for URL-based routing only
 * No session access (Edge runtime limitation) - auth happens in server components/route handlers
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || "stackcess.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const appHost = appUrl ? new URL(appUrl).host : null;
  const host = request.headers.get("host") || request.nextUrl.host;
  const tenantFromHost = getTenantFromHost(host, baseDomain, appHost);

  if (tenantFromHost) {
    const isAuthPath =
      pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/onboarding" ||
      pathname.startsWith("/api/auth");

    if (isAuthPath && appHost) {
      const redirectUrl = new URL(request.url);
      redirectUrl.host = appHost;
      redirectUrl.protocol = appUrl ? new URL(appUrl).protocol : redirectUrl.protocol;
      return NextResponse.redirect(redirectUrl);
    }

    if (!pathname.startsWith(`/${tenantFromHost}`)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${tenantFromHost}${pathname}`;
      return NextResponse.rewrite(url);
    }
  }
  
  console.log('🛡️ Middleware: Checking route:', pathname);
  
  // Always allow public routes
  if (isPublicRoute(pathname)) {
    console.log('📂 Public route, allowing access:', pathname);
    return NextResponse.next();
  }
  
  // For protected routes, let server components handle auth
  if (isProtectedRoute(pathname)) {
    console.log('🔒 Protected route detected, will verify auth in server component:', pathname);
    return NextResponse.next();
  }
  
  // For tenant routes, let server components handle tenant verification
  if (isTenantRoute(pathname)) {
    console.log('🏢 Tenant route detected, will verify access in server component:', pathname);
    return NextResponse.next();
  }
  
  // Default: allow through (auth verification happens server-side)
  console.log('➡️ Default route, allowing through:', pathname);
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes - handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
