import { NextRequest, NextResponse } from "next/server";
import { isPublicRoute, isProtectedRoute, isTenantRoute } from "./lib/routes";

/**
 * Lightweight middleware for URL-based routing only
 * No session access (Edge runtime limitation) - auth happens in server components/route handlers
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
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