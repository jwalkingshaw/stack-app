/**
 * Layered session refresh with multiple safety nets
 * 1) Server-side session refresh (primary)
 * 2) Client cache invalidation (safety net)
 * 3) Smart retry with exponential backoff (fallback)
 */

interface SessionRefreshOptions {
  maxRetries?: number;
  baseDelay?: number;
  targetPath: string;
}

interface AppRouter {
  push: (href: string) => void;
}

interface SwrWindow extends Window {
  __SWR_CACHE__?: Map<string, unknown>;
}

/**
 * Refreshes user session with layered approach and navigates to target.
 */
export async function refreshSessionAndNavigate(
  router: AppRouter,
  options: SessionRefreshOptions
): Promise<void> {
  const { maxRetries = 3, baseDelay = 500, targetPath } = options;

  // Layer 1: server-side session refresh.
  try {
    const refreshResponse = await fetch("/api/auth/refresh-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (refreshResponse.ok) {
      await refreshResponse.json();
      // Session refreshed successfully
    }
  } catch (error) {
    console.warn("[session-refresh] Server refresh failed:", error);
  }

  // Layer 2: client cache invalidation.
  try {
    if (typeof window !== "undefined") {
      const cacheKeys = ["/api/me", "/api/auth/setup"];
      const swrCache = (window as SwrWindow).__SWR_CACHE__;

      if (swrCache instanceof Map) {
        for (const key of cacheKeys) {
          swrCache.delete(key);
        }
      }

      try {
        localStorage.removeItem("user-session-cache");
        localStorage.removeItem("organization-cache");
      } catch {
        // Ignore localStorage access failures (private mode, etc).
      }
    }
  } catch (error) {
    console.warn("[session-refresh] Cache invalidation failed:", error);
  }

  // Layer 3: retry with verification.
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const orgCheckResponse = await fetch("/api/auth/check-org-context", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (orgCheckResponse.ok) {
        const orgData = (await orgCheckResponse.json()) as {
          authenticated?: boolean;
          hasOrganization?: boolean;
          organization?: { orgCode?: string };
        };

        if (orgData.authenticated && orgData.hasOrganization && orgData.organization?.orgCode) {
          const meResponse = await fetch("/api/me", {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          });

          if (meResponse.ok) {
            const userData = (await meResponse.json()) as {
              user?: unknown;
              organization?: { id?: string } | null;
            };
            if (userData.user && userData.organization?.id) {
              router.push(targetPath);
              return;
            }
          }
        }
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(1.5, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.warn(`[session-refresh] Verification attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  router.push(targetPath);
}

/**
 * Simple session refresh without navigation.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/refresh-session", { method: "POST" });
    return response.ok;
  } catch (error) {
    console.error("[session-refresh] Refresh failed:", error);
    return false;
  }
}
