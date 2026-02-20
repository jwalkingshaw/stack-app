import { NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

// POST /api/auth/refresh-session
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Refreshing user session...');
    
    // Get current session to verify user is authenticated
    const { getUser, getOrganization, isAuthenticated } = getKindeServerSession();
    
    if (!(await isAuthenticated())) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await getUser();
    console.log('👤 Refreshing session for user:', user?.email);

    // Try to get fresh organization data
    const organization = await getOrganization();
    console.log('🏢 Current organization in session:', {
      orgCode: organization?.orgCode,
      name: (organization as any)?.name
    });

    // Create response with fresh session data
    const response = NextResponse.json({ 
      success: true, 
      refreshed: true,
      user: user?.email,
      organization: organization ? {
        orgCode: organization.orgCode,
        name: (organization as any).name
      } : null
    });

    // Clear all possible caches to force fresh session data
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Session-Refresh', 'true');
    
    // Force browser to reload cookies/session
    response.headers.set('Vary', 'Cookie');
    
    console.log('✅ Session refresh completed with organization data');
    return response;

  } catch (error) {
    console.error('❌ Session refresh failed:', error);
    return NextResponse.json(
      { error: 'Session refresh failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/auth/refresh-session - for testing
export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to refresh session',
    endpoint: '/api/auth/refresh-session'
  });
}