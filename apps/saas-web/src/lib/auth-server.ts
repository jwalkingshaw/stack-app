// Server-only utilities for Kinde authentication
import "server-only";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import type { User, Organization } from "@tradetool/types";
import { cache } from 'react';

/**
 * Get the current user if authenticated, null otherwise
 * Cached for performance during request lifecycle
 * @returns Promise<KindeUser | null>
 */
export const requireUser = cache(async () => {
  const { getUser, isAuthenticated } = getKindeServerSession();
  if (!(await isAuthenticated())) return null;
  return await getUser();
});

/**
 * Get the current user or throw an error if not authenticated
 * @returns Promise<KindeUser> - Authenticated user
 * @throws Error if not authenticated
 */
export async function assertUser() {
  const user = await requireUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Get the current organization from Kinde session
 * Cached for performance during request lifecycle
 * @returns Promise<KindeOrganization | null>
 */
export const requireOrganization = cache(async () => {
  const { getOrganization, isAuthenticated } = getKindeServerSession();
  if (!(await isAuthenticated())) return null;
  return await getOrganization();
});

/**
 * Get current user's organization details from Supabase
 * Cached for performance during request lifecycle
 * @returns Promise<Organization | null>
 */
export const getCurrentOrganization = cache(async () => {
  try {
    const kindeOrg = await requireOrganization();
    console.log('🔍 Kinde organization from session:', {
      orgCode: kindeOrg?.orgCode,
      name: kindeOrg?.name
    });
    
    if (!kindeOrg?.orgCode) {
      console.log('❌ No Kinde org code found');
      return null;
    }

    const supabase = createServerClient();
    const db = new DatabaseQueries(supabase);
    
    // Get organization from Supabase using Kinde org ID
    const organization = await db.getOrganizationByKindeId(kindeOrg.orgCode);
    console.log('🔍 Supabase organization lookup:', {
      kindeOrgId: kindeOrg.orgCode,
      foundOrg: organization ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug
      } : null
    });
    
    return organization;
  } catch (error) {
    console.error('Failed to get current organization:', error);
    return null;
  }
});

/**
 * Check if user has access to a specific tenant
 * @param tenantSlug - The tenant slug to check access for
 * @returns Promise<boolean>
 */
export async function hasAccessToTenant(tenantSlug: string): Promise<boolean> {
  try {
    const kindeOrg = await requireOrganization();
    if (!kindeOrg?.orgCode) return false;

    // Remove 'org_' prefix if present and compare with tenant slug
    const orgCodeValue = kindeOrg.orgCode.startsWith('org_') 
      ? kindeOrg.orgCode.substring(4) 
      : kindeOrg.orgCode;
    
    return orgCodeValue === tenantSlug;
  } catch (error) {
    console.error('Failed to check tenant access:', error);
    return false;
  }
}

/**
 * Get safe user data for client consumption
 * Cached for performance during request lifecycle
 * @returns Promise<SafeUser | null>
 */
export const getSafeUserData = cache(async () => {
  const user = await requireUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email || '',
    given_name: user.given_name || null,
    family_name: user.family_name || null,
    picture: user.picture || null,
  };
});

/**
 * Get safe organization data for client consumption
 * Cached for performance during request lifecycle
 * @returns Promise<SafeOrganization | null>
 */
export const getSafeOrganizationData = cache(async () => {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    storageUsed: organization.storageUsed,
    storageLimit: organization.storageLimit,
  };
});

/**
 * Check if the current session is authenticated
 * Cached for performance during request lifecycle
 * @returns Promise<boolean>
 */
export const isAuthenticated = cache(async (): Promise<boolean> => {
  const { isAuthenticated } = getKindeServerSession();
  return await isAuthenticated();
});