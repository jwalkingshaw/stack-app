// Server-only utilities for Kinde authentication
import "server-only";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import type { User, Organization } from "@tradetool/types";
import { cache } from 'react';
import { cache as redisCache, CacheKeys, CacheTTL } from './redis';

type KindeSessionSnapshot = {
  user: Awaited<ReturnType<ReturnType<typeof getKindeServerSession>["getUser"]>> | null;
  organization: Awaited<ReturnType<ReturnType<typeof getKindeServerSession>["getOrganization"]>> | null;
};

const getSessionSnapshot = cache(async (): Promise<KindeSessionSnapshot> => {
  const { getUser, getOrganization } = getKindeServerSession();
  try {
    // Avoid explicit isAuthenticated() to prevent repeated JWKS fetches on parallel API boot calls.
    const user = await getUser();
    if (!user) {
      return { user: null, organization: null };
    }

    const organization = await getOrganization().catch(() => null);
    return { user, organization };
  } catch (error: any) {
    const isAbort = error?.name === "AbortError" || error?.code === 20;
    if (isAbort) {
      console.warn("Auth snapshot aborted while resolving Kinde session.");
    } else {
      console.error("Auth snapshot failed:", error);
    }
    return { user: null, organization: null };
  }
});

/**
 * Get the current user if authenticated, null otherwise
 * Cached for performance during request lifecycle
 * @returns Promise<KindeUser | null>
 */
export const requireUser = cache(async () => {
  const snapshot = await getSessionSnapshot();
  return snapshot.user;
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
  const snapshot = await getSessionSnapshot();
  return snapshot.organization;
});

/**
 * Get current user's organization details from Supabase
 * Cached with Redis for performance across requests
 * @returns Promise<Organization | null>
 */
export const getCurrentOrganization = cache(async () => {
  try {
    const kindeOrg = await requireOrganization();

    if (!kindeOrg?.orgCode) {
      return null;
    }

    // Check Redis cache first
    const cacheKey = CacheKeys.organizationByKindeId(kindeOrg.orgCode);
    const cached = await redisCache.get<Organization>(cacheKey);
    if (cached) {
      return cached;
    }

    const supabase = createServerClient();
    const db = new DatabaseQueries(supabase);

    // Get organization from Supabase using Kinde org ID
    const organization = await db.getOrganizationByKindeId(kindeOrg.orgCode);

    // Cache the result
    if (organization) {
      await redisCache.set(cacheKey, organization, CacheTTL.ORGANIZATION);
    }

    return organization;
  } catch (error) {
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
    return false;
  }
}

/**
 * Get safe user data for client consumption
 * Cached with Redis for performance across requests
 * @returns Promise<SafeUser | null>
 */
export const getSafeUserData = cache(async () => {
  const user = await requireUser();
  if (!user) return null;

  // Check Redis cache first
  const cacheKey = CacheKeys.user(user.id);
  const cached = await redisCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const safeUser = {
    id: user.id,
    email: user.email || '',
    given_name: user.given_name || null,
    family_name: user.family_name || null,
    picture: user.picture || null,
    name: `${user.given_name || ''} ${user.family_name || ''}`.trim() || user.email || '',
  };

  // Cache the safe user data
  await redisCache.set(cacheKey, safeUser, CacheTTL.USER_SESSION);

  return safeUser;
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
    type: (organization.organizationType || organization.type || 'brand') as 'brand' | 'partner',
    partnerCategory: organization.partnerCategory ?? null,
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
  const user = await requireUser();
  return Boolean(user);
});
