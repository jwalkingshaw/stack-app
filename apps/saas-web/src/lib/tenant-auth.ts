import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";
import type { Organization } from "@tradetool/types";
import { evaluateTenantAccessDecision } from "@/lib/tenant-access-decision";

export interface TenantAuthResult {
  success: boolean;
  organization?: Organization;
  userId?: string;
  error?: NextResponse;
}

export type TenantAccessResult =
  | { ok: true; organization: Organization; userId?: string }
  | { ok: false; response: NextResponse };

/**
 * Enforce tenant access and return a consistent result for route handlers.
 */
export async function requireTenantAccess(
  request: NextRequest,
  tenantSlug: string
): Promise<TenantAccessResult> {
  const authResult = await verifyTenantAccess(request, tenantSlug);
  if (!authResult.success) {
    return { ok: false, response: authResult.error! };
  }

  if (!authResult.organization) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true,
    organization: authResult.organization,
    userId: authResult.userId,
  };
}

/**
 * Secure multi-tenant authorization
 * 1. Lookup organization by user-friendly slug
 * 2. Allow access only if user has direct active workspace membership.
 *    Partner brand relationships are for shared-content visibility in partner context,
 *    not for cross-tenant workspace access.
 */
export async function verifyTenantAccess(
  request: NextRequest,
  tenantSlug: string
): Promise<TenantAuthResult> {
  try {
    // Check authentication
    const session = await getAuthSession(request);
    
    if (!session.isAuthenticated) {
      return {
        success: false,
        error: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        )
      };
    }

    const db = new DatabaseQueries(supabaseServer);
    
    // Step 1: Get organization by user-friendly slug
    const organization = await db.getOrganizationBySlug(tenantSlug);
    if (!organization) {
      return {
        success: false,
        error: NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        )
      };
    }

    const userId = session.user?.id || "";
    const { data: membershipRows, error: membershipError } = await (supabaseServer as any)
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("kinde_user_id", userId)
      .eq("status", "active")
      .limit(1);
    const hasWorkspaceAccess =
      !membershipError && Array.isArray(membershipRows) && membershipRows.length > 0;

    // Step 2: Verify user has explicit workspace access (membership-based only).
    const preDecision = evaluateTenantAccessDecision({
      hasMembership: hasWorkspaceAccess,
    });
    if (!preDecision.allow) {
      console.error('Access denied - membership missing:', {
        organizationKindeId: organization.kindeOrgId,
        requestedTenant: tenantSlug,
        reason: preDecision.reason
      });
      return {
        success: false,
        error: NextResponse.json(
          { error: "Access denied to this tenant" },
          { status: 403 }
        )
      };
    }
    
    return {
      success: true,
      organization,
      userId: session.user?.id
    };

  } catch (error) {
    console.error("Tenant auth verification failed:", error);
    return {
      success: false,
      error: NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    };
  }
}



