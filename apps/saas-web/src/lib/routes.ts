// Route protection configuration

export const PROTECTED_PREFIXES = [
  "/dashboard", 
  "/settings", 
  "/onboarding"
];

export const TENANT_PREFIXES = [
  // Tenant-specific routes that require org access
  // These will be handled dynamically based on [tenant] parameter
];

export const PUBLIC_PREFIXES = [
  "/",
  "/login", 
  "/register",
  "/unauthorized",
  "/api/auth",
  "/api/webhooks",
  "/api/health-check",
  "/favicon.ico",
  "/_next",
  "/dev", // Development routes
];

/**
 * Check if a route is public and doesn't require authentication
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(route => pathname.startsWith(route));
}

/**
 * Check if a route requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(route => pathname.startsWith(route));
}

/**
 * Check if a route is tenant-specific
 */
export function isTenantRoute(pathname: string): boolean {
  // Check if path matches pattern: /[tenant]/...
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return false;
  
  // Skip if it's a known public/protected route
  if (isPublicRoute(pathname) || isProtectedRoute(pathname)) return false;
  
  // If first segment is not "api" and not a known route, assume it's a tenant
  return pathParts[0] !== 'api';
}