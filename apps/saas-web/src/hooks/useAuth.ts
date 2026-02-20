// Legacy file - use useMe instead
// This file is kept for backward compatibility but redirects to the secure useMe hook

"use client";

import { useMe } from "./useMe";

/**
 * @deprecated Use useMe instead for secure server-side session management
 * This hook is kept for backward compatibility
 */
export function useAuth() {
  const { me, user, organization, loading, error, isAuthenticated, login, logout, register } = useMe();

  // Map to legacy interface for backward compatibility
  return {
    isLoading: loading,
    isAuthenticated,
    user: user ? {
      id: user.id,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      name: user.name,
      picture: user.picture,
    } : null,
    organization: organization ? {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      type: organization.type,
      organizationType: organization.type,
      partnerCategory: organization.partnerCategory,
      kindeOrgId: organization.id, // Note: This mapping may need adjustment
      storageUsed: organization.storageUsed,
      storageLimit: organization.storageLimit,
      createdAt: new Date().toISOString(), // Placeholder
      updatedAt: new Date().toISOString(), // Placeholder
    } : null,
    orgCode: organization?.slug || null,
    error,
    login,
    logout,
    register,
    getAccessToken: async () => {
      console.warn('getAccessToken is deprecated - tokens are now server-side only');
      return null;
    },
  };
}
