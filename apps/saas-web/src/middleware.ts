import { NextRequest, NextResponse } from "next/server";
import { isPublicRoute, isProtectedRoute, isTenantRoute } from "./lib/routes";

const RESERVED_SUBDOMAINS = new Set(["app", "www", "localhost", "dev"]);
const NON_TENANT_ROOT_SEGMENTS = new Set([
  "api",
  "_next",
  "login",
  "logout",
  "register",
  "onboarding",
  "welcome",
  "unauthorized",
  "invitations",
  "notifications",
  "u",
  "home",
  "all-brands",
  "test",
  "dev",
]);

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

function getTenantFromPathname(pathname: string): string | null {
  const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
  const candidate = firstSegment.trim().toLowerCase();
  if (!candidate || NON_TENANT_ROOT_SEGMENTS.has(candidate)) return null;
  return candidate;
}

function buildRequestHeaders(request: NextRequest, tenantSlug: string | null): Headers {
  const headers = new Headers(request.headers);
  if (tenantSlug) {
    headers.set("x-tenant-slug", tenantSlug);
  } else {
    headers.delete("x-tenant-slug");
  }
  const canonicalPathname =
    tenantSlug && !request.nextUrl.pathname.startsWith(`/${tenantSlug}`)
      ? `/${tenantSlug}${request.nextUrl.pathname}`
      : request.nextUrl.pathname;
  headers.set("x-request-pathname", canonicalPathname);
  return headers;
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
  const tenantFromPath = getTenantFromPathname(pathname);
  const tenantSlug = tenantFromHost || tenantFromPath;
  const requestHeaders = buildRequestHeaders(request, tenantSlug);

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
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
      });
    }
  }
  
  // Always allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // For protected routes, let server components handle auth
  if (isProtectedRoute(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // For tenant routes, let server components handle tenant verification
  if (isTenantRoute(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Default: allow through (auth verification happens server-side)
  return NextResponse.next({ request: { headers: requestHeaders } });
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
