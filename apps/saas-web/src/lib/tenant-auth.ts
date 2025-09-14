import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";
import type { Organization } from "@tradetool/types";

export interface TenantAuthResult {
  success: boolean;
  organization?: Organization;
  userId?: string;
  error?: NextResponse;
}

/**
 * Secure multi-tenant authorization
 * 1. Lookup organization by user-friendly slug
 * 2. Verify user's Kinde org ID matches organization's Kinde org ID
 * This prevents unauthorized access even if someone guesses a slug
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

    console.log('Tenant access verification:', {
      tenantSlug,
      organizationKindeId: organization.kindeOrgId,
      sessionOrgCode: session.orgCode,
      userId: session.user?.id
    });
    
    // Step 2: Verify user has access - try Kinde org context first, fallback to database
    if (session.orgCode && session.orgCode !== organization.kindeOrgId) {
      console.error('Access denied - Kinde org mismatch:', {
        sessionOrgCode: session.orgCode,
        organizationKindeId: organization.kindeOrgId,
        requestedTenant: tenantSlug
      });
      return {
        success: false,
        error: NextResponse.json(
          { error: "Access denied to this tenant" },
          { status: 403 }
        )
      };
    }
    
    // Fallback: If no Kinde org context, verify through database membership
    if (!session.orgCode) {
      console.log('⚠️ No Kinde org context, using database verification for user:', session.user.id);
      
      const membership = await db.getOrganizationMembership(organization.id, session.user.id);
      if (!membership) {
        console.error('Access denied - no database membership:', {
          userId: session.user.id,
          organizationId: organization.id,
          requestedTenant: tenantSlug
        });
        return {
          success: false,
          error: NextResponse.json(
            { error: "Access denied to this tenant" },
            { status: 403 }
          )
        };
      }
      
      console.log('✅ Database verification successful - user has access:', {
        userId: session.user.id,
        orgId: organization.id,
        role: membership.role
      });
    }

    return {
      success: true,
      organization,
      userId: session.user.id
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