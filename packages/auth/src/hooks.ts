'use client';

import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs';
import { useState, useEffect } from 'react';
import type { User, Organization } from '@tradetool/types';

export function useAuth() {
  const { user, isAuthenticated, isLoading } = useKindeBrowserClient();
  
  return {
    user: user ? {
      id: user.id,
      email: user.email || '',
      name: user.given_name && user.family_name 
        ? `${user.given_name} ${user.family_name}`
        : user.email || '',
      picture: user.picture || undefined,
    } as User : null,
    isAuthenticated,
    isLoading,
  };
}

export function useOrganization() {
  const { organization } = useKindeBrowserClient();
  
  return {
    organization: organization ? {
      kindeOrgId: organization.orgCode,
      name: organization.orgName || organization.orgCode,
      slug: organization.orgCode,
    } : null,
  };
}