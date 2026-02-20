import { redirect } from 'next/navigation';
import { AuthService } from './kinde-auth';

export function requireAuth() {
  // This will be called in server components to ensure authentication
  // If not authenticated, redirect to login
}

export function requireOrganization(slug: string) {
  // This will be called to ensure user has access to the organization
  // If no access, redirect to unauthorized page
}

export async function withAuth<T extends any[]>(
  authService: AuthService,
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const user = await authService.getCurrentUser();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(...args);
  };
}

export async function withOrganizationAuth<T extends any[]>(
  authService: AuthService,
  organizationId: string,
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const user = await authService.getCurrentUser();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organizationId);
    
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(...args);
  };
}