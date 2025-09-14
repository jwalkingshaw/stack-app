// Legacy auth utilities - use auth-server.ts instead
// This file is kept for backward compatibility but uses secure server-side session management

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";
import { requireUser, requireOrganization, hasAccessToTenant } from "./auth-server";

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
  const host = request.headers.get("host") || url.host;
  const subdomain = host.split(".")[0];
  
  if (subdomain && subdomain !== "localhost" && subdomain !== "www") {
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