/**
 * Layered session refresh with multiple safety nets
 * 1. Server-side session refresh (primary)
 * 2. Client cache invalidation (safety net)  
 * 3. Smart retry with exponential backoff (fallback)
 */

interface SessionRefreshOptions {
  maxRetries?: number;
  baseDelay?: number;
  targetPath: string;
}

/**
 * Refreshes user session with layered approach and navigates to target
 */
export async function refreshSessionAndNavigate(
  router: any, 
  options: SessionRefreshOptions
): Promise<void> {
  const { maxRetries = 3, baseDelay = 500, targetPath } = options;
  
  console.log('🔄 Starting layered session refresh for:', targetPath);

  // Layer 1: Server-side session refresh (with organization context check)
  try {
    console.log('📡 Layer 1: Server-side session refresh');
    const refreshResponse = await fetch('/api/auth/refresh-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (refreshResponse.ok) {
      const refreshData = await refreshResponse.json();
      console.log('✅ Server session refresh successful:', {
        user: refreshData.user,
        hasOrg: !!refreshData.organization
      });
      
      // If we got organization context back, that's a good sign
      if (refreshData.organization) {
        console.log('🏢 Organization found in refreshed session:', refreshData.organization.name);
      } else {
        console.log('⚠️ No organization in refreshed session yet, will retry');
      }
    } else {
      console.warn('⚠️ Server session refresh failed, continuing with fallbacks');
    }
  } catch (error) {
    console.warn('⚠️ Server session refresh error:', error);
  }

  // Layer 2: Client cache invalidation
  try {
    console.log('💾 Layer 2: Client cache invalidation');
    
    // Clear React cache if available
    if (typeof window !== 'undefined') {
      // Clear any cached user data
      const cacheKeys = ['/api/me', '/api/auth/setup'];
      
      // If using SWR, clear cache
      if ('__SWR_CACHE__' in window) {
        cacheKeys.forEach(key => {
          try {
            // @ts-ignore - SWR cache clearing
            window.__SWR_CACHE__.delete(key);
          } catch (e) {
            // Ignore cache clearing errors
          }
        });
      }
      
      // Clear any localStorage session data
      try {
        localStorage.removeItem('user-session-cache');
        localStorage.removeItem('organization-cache');
      } catch (e) {
        // Ignore localStorage errors
      }
    }
    
    console.log('✅ Client cache invalidation completed');
  } catch (error) {
    console.warn('⚠️ Client cache invalidation error:', error);
  }

  // Layer 3: Smart retry with verification
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🎯 Attempt ${attempt}: Verifying session and navigating`);
    
    try {
      // First check if Kinde session has organization context
      const orgCheckResponse = await fetch('/api/auth/check-org-context', {
        cache: 'no-store',
        headers: { 
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (orgCheckResponse.ok) {
        const orgData = await orgCheckResponse.json();
        console.log('🔍 Kinde session check:', {
          authenticated: orgData.authenticated,
          hasOrganization: orgData.hasOrganization,
          orgCode: orgData.organization?.orgCode
        });
        
        if (orgData.authenticated && orgData.hasOrganization && orgData.organization?.orgCode) {
          console.log('✅ Kinde session has organization context, verifying /api/me');
          
          // Now verify that /api/me also returns organization data
          const meResponse = await fetch('/api/me', {
            cache: 'no-store',
            headers: { 
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          if (meResponse.ok) {
            const userData = await meResponse.json();
            if (userData.user && userData.organization && userData.organization.id) {
              console.log('✅ Session fully ready with organization context, navigating to:', targetPath);
              router.push(targetPath);
              return;
            } else {
              console.log('⚠️ /api/me missing organization context despite Kinde session having it');
            }
          }
        } else {
          console.log('⚠️ Kinde session missing organization context, waiting...');
        }
      }
      
      // If not ready and not final attempt, wait and retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(1.5, attempt - 1); // Exponential backoff
        console.log(`⏱️ Session not ready, waiting ${delay}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.warn(`⚠️ Session verification attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Final attempt - navigate regardless
  console.log('🚨 Max retries reached, attempting navigation anyway');
  router.push(targetPath);
}

/**
 * Simple session refresh without navigation (for other use cases)
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh-session', {
      method: 'POST'
    });
    return response.ok;
  } catch (error) {
    console.error('Session refresh failed:', error);
    return false;
  }
}