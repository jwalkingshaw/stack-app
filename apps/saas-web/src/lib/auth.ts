// Legacy auth utilities - use auth-server.ts instead
// This file is kept for backward compatibility but uses secure server-side session management

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";
import { requireUser, requireOrganization, hasAccessToTenant } from "./auth-server";

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
 * @deprecated Use functions from auth-server.ts instead
 * Get auth session using secure server-side verification (no JWT parsing)
 */
export async function getAuthSession(request: NextRequest) {
  try {
    const user = await requireUser();
    const organization = await requireOrganization();
    
    if (!user) {
      return { 
        isAuthenticated: false, 
        user: null, 
        organization: null, 
        orgCode: null 
      };
    }

    // Get org code from Kinde organization object
    const orgCode = organization?.orgCode || null;

    return {
      isAuthenticated: true,
      user: {
        id: user.id,
        email: user.email || "",
        name: `${user.given_name || ""} ${user.family_name || ""}`.trim() || user.email || "",
        picture: user.picture || undefined,
      },
      organization: organization ? {
        id: organization.orgCode, // Using orgCode as ID for compatibility
        name: organization.orgName || "Unknown Organization",
        code: organization.orgCode,
      } : null,
      orgCode,
    };
  } catch (error) {
    console.error("Auth session error:", error);
    return { 
      isAuthenticated: false, 
      user: null, 
      organization: null, 
      orgCode: null 
    };
  }
}

/**
 * Extract tenant slug from subdomain or path
 */
export function extractTenantSlug(request: NextRequest): string | null {
  const url = new URL(request.url);
  
  // Try subdomain first (tenant.domain.com)
  const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || "stackcess.com";
  const appHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : null;
  const host = request.headers.get("host") || url.host;
  const subdomain = getTenantFromHost(host, baseDomain, appHost);

  if (subdomain) {
    return subdomain;
  }
  
  // Try path-based tenant (/tenant/...)
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length > 0 && pathSegments[0] !== "api") {
    return pathSegments[0];
  }
  
  return null;
}

/**
 * @deprecated Use hasAccessToTenant from auth-server.ts instead
 * Check if user has access to tenant using secure server-side verification
 */
export async function verifyTenantAccess(
  request: NextRequest,
  tenantSlug: string
): Promise<boolean> {
  try {
    return await hasAccessToTenant(tenantSlug);
  } catch (error) {
    console.error('Tenant access verification error:', error);
    return false;
  }
}
