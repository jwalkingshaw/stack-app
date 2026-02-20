"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "./useAuth";
import { useEffect, useState } from "react";
import type { Organization } from "@tradetool/types";

interface TenantState {
  tenantSlug: string | null;
  organization: Organization | null;
  isValidTenant: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useTenant() {
  const pathname = usePathname();
  const { organization: userOrg, orgCode, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [tenantState, setTenantState] = useState<TenantState>({
    tenantSlug: null,
    organization: null,
    isValidTenant: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Extract tenant slug from pathname
    const pathSegments = pathname.split("/").filter(Boolean);
    const tenantSlug = pathSegments[0] || null;

    // DEVELOPMENT MODE: Allow demo tenants without authentication
    if (tenantSlug && (tenantSlug === "demo-org" || tenantSlug === "test-company")) {
      const mockOrg: Organization = {
        id: `mock-${tenantSlug}`,
        name: tenantSlug === "demo-org" ? "Demo Organization" : "Test Company",
        slug: tenantSlug,
        type: 'brand',
        organizationType: 'brand',
        partnerCategory: null,
        kindeOrgId: `mock-${tenantSlug}`,
        storageUsed: 0,
        storageLimit: 5368709120, // 5GB
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTenantState({
        tenantSlug,
        organization: mockOrg,
        isValidTenant: true,
        isLoading: false,
        error: null,
      });
      return;
    }

    if (authLoading) {
      setTenantState(prev => ({ ...prev, isLoading: true }));
      return;
    }

    // If no tenant in URL and user is authenticated, they should be redirected
    if (!tenantSlug && isAuthenticated && userOrg) {
      setTenantState({
        tenantSlug: null,
        organization: null,
        isValidTenant: false,
        isLoading: false,
        error: "No tenant specified in URL",
      });
      return;
    }

    // If tenant in URL but user not authenticated
    if (tenantSlug && !isAuthenticated) {
      setTenantState({
        tenantSlug,
        organization: null,
        isValidTenant: false,
        isLoading: false,
        error: "User not authenticated",
      });
      return;
    }

    // If both tenant and user auth are available, validate access
    if (tenantSlug && isAuthenticated) {
      console.log('🔍 Tenant validation:', { tenantSlug, orgCode, userOrg: userOrg?.slug });
      
      // Primary validation: Use org_code from JWT token
      let isValidTenant = false;
      if (orgCode) {
        // Remove 'org_' prefix from org_code to get the actual code
        const orgCodeValue = orgCode.startsWith('org_') ? orgCode.substring(4) : orgCode;
        isValidTenant = orgCodeValue === tenantSlug;
        console.log('🔍 Using org_code validation:', { orgCode, orgCodeValue, tenantSlug, isValidTenant });
      } 
      // Fallback: Use organization slug from Supabase
      else if (userOrg) {
        isValidTenant = userOrg.slug === tenantSlug;
        console.log('🔍 Using organization slug validation:', { orgSlug: userOrg.slug, tenantSlug, isValidTenant });
      }
      
      setTenantState({
        tenantSlug,
        organization: isValidTenant && userOrg
          ? {
              ...userOrg,
              type: (userOrg.organizationType || userOrg.type || 'brand') as 'brand' | 'partner',
              organizationType: (userOrg.organizationType || userOrg.type || 'brand') as 'brand' | 'partner',
              partnerCategory: userOrg.partnerCategory ?? null,
            }
          : null,
        isValidTenant,
        isLoading: false,
        error: isValidTenant ? null : "Access denied to this organization",
      });
      return;
    }

    // Default state
    setTenantState({
      tenantSlug,
      organization: null,
      isValidTenant: false,
      isLoading: false,
      error: null,
    });
  }, [pathname, isAuthenticated, userOrg, orgCode, authLoading]);

  return tenantState;
}

// Hook to get current organization with storage info from Supabase
export function useOrganization() {
  const { organization, isValidTenant } = useTenant();
  const [storageInfo, setStorageInfo] = useState({
    used: 0,
    limit: 5368709120, // 5GB default
    loading: true,
  });

  useEffect(() => {
    async function loadStorageInfo() {
      if (!organization || !isValidTenant) {
        setStorageInfo(prev => ({ ...prev, loading: false }));
        return;
      }

      // DEVELOPMENT MODE: Use mock storage info for demo tenants
      if (organization.slug === "demo-org" || organization.slug === "test-company") {
        setStorageInfo({
          used: 1024 * 1024 * 500, // 500MB used
          limit: 5368709120, // 5GB limit
          loading: false,
        });
        return;
      }

      try {
        // Fetch storage info from API
        const response = await fetch(`/api/organizations/${organization.slug}/storage`);
        if (response.ok) {
          const data = await response.json();
          setStorageInfo({
            used: data.used || 0,
            limit: data.limit || 5368709120,
            loading: false,
          });
        } else {
          setStorageInfo(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error("Failed to load storage info:", error);
        setStorageInfo(prev => ({ ...prev, loading: false }));
      }
    }

    loadStorageInfo();
  }, [organization, isValidTenant]);

  return {
    organization,
    isValidTenant,
    storage: storageInfo,
  };
}
