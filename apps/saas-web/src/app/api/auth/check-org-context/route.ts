import { NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

// GET /api/auth/check-org-context
// Checks if the user's session has organization context
export async function GET(request: NextRequest) {
  try {
    const { getUser, getOrganization, isAuthenticated } = getKindeServerSession();
    
    if (!(await isAuthenticated())) {
      return NextResponse.json(
        { authenticated: false, hasOrganization: false },
        { status: 200 }
      );
    }

    const user = await getUser();
    const organization = await getOrganization();
    
    console.log('🔍 Checking session context:', {
      userId: user?.id,
      userEmail: user?.email,
      orgCode: organization?.orgCode,
      orgName: (organization as any)?.name
    });
    
    return NextResponse.json({
      authenticated: true,
      hasOrganization: !!organization?.orgCode,
      user: user ? {
        id: user.id,
        email: user.email
      } : null,
      organization: organization ? {
        orgCode: organization.orgCode,
        name: (organization as any).name
      } : null
    });

  } catch (error) {
    console.error('❌ Failed to check organization context:', error);
    return NextResponse.json(
      { error: 'Failed to check session context', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}