"use client";

import { useEffect, useState } from "react";

// Enhanced cache with Redis fallback awareness
let cachedMe: MeData | undefined;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 seconds (short for immediate UX)
let pendingRequest: Promise<MeData> | null = null;

export type SafeUser = {
  id: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
  picture: string | null;
  name: string;
};

export type SafeOrganization = {
  id: string;
  name: string;
  slug: string;
  type: "brand" | "partner";
  partnerCategory: "retailer" | "distributor" | "wholesaler" | null;
  storageUsed: number;
  storageLimit: number;
};

export type MeData = {
  user: SafeUser;
  organization: SafeOrganization | null;
} | null;

export function useMe() {
  const [me, setMe] = useState<MeData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMe() {
      try {
        // Check cache first
        const now = Date.now();
        if (cachedMe !== undefined && (now - cacheTimestamp) < CACHE_DURATION) {
          if (!cancelled) {
            setMe(cachedMe);
            setError(null);
            setLoading(false);
          }
          return;
        }

        // If there's already a pending request, wait for it
        if (pendingRequest) {
          const data = await pendingRequest;
          if (!cancelled) {
            setMe(data);
            setError(null);
            setLoading(false);
          }
          return;
        }

        // Make new request
        pendingRequest = (async () => {
          const res = await fetch("/api/me", { 
            credentials: "include"
          });
          
          if (!res.ok) {
            if (res.status === 401) {
              // User is not authenticated
              cachedMe = null;
              cacheTimestamp = now;
              return null;
            } else {
              throw new Error(`Failed to fetch user data: ${res.status}`);
            }
          }
          
          const data = (await res.json()) as MeData;
          cachedMe = data;
          cacheTimestamp = now;
          return data;
        })();

        const data = await pendingRequest;
        pendingRequest = null;

        if (!cancelled) {
          setMe(data);
          setError(null);
        }
      } catch (err) {
        pendingRequest = null;
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setMe(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMe();

    return () => {
      cancelled = true;
    };
  }, []);

  // Helper functions for easier usage
  const login = () => {
    window.location.href = "/api/auth/login";
  };

  const logout = () => {
    window.location.href = "/api/auth/logout";
  };

  const register = () => {
    window.location.href = "/api/auth/register";
  };

  return {
    me,
    user: me?.user || null,
    organization: me?.organization || null,
    loading,
    error,
    isAuthenticated: !!me?.user,
    login,
    logout,
    register,
  };
}
