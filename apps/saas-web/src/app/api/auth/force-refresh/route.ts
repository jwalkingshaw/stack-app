import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

// POST /api/auth/force-refresh
// Forces a complete Kinde session refresh by redirecting through auth flow
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Forcing complete session refresh via Kinde redirect...');
    
    const body = await request.json();
    const { returnUrl } = body;
    
    if (!returnUrl) {
      return NextResponse.json(
        { error: 'returnUrl is required' },
        { status: 400 }
      );
    }

    // Create auth URL that will force fresh token retrieval
    // This uses Kinde's prompt=login parameter to force re-authentication
    const authUrl = new URL('/api/auth/login', request.url);
    authUrl.searchParams.set('post_login_redirect_url', returnUrl);
    authUrl.searchParams.set('prompt', 'none'); // Try silent re-auth first
    
    console.log('🔗 Redirecting to force session refresh:', authUrl.toString());
    
    return NextResponse.json({
      success: true,
      redirectUrl: authUrl.toString(),
      message: 'Redirect to refresh session'
    });

  } catch (error) {
    console.error('❌ Force session refresh failed:', error);
    return NextResponse.json(
      { error: 'Force session refresh failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}