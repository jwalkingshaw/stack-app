import { NextResponse } from "next/server";
import { requireUser } from '@/lib/auth-server';
import { createServerClient } from '@tradetool/database';

export async function GET() {
  try {
    const user = await requireUser();
    
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Test the exact same query as SmartRouter
    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        kinde_user_id,
        email,
        role,
        status,
        last_accessed_at,
        organization:organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active');

    // Also test without status filter
    const { data: allMemberships, error: allError } = await supabase
      .from('organization_members')
      .select(`
        id,
        kinde_user_id,
        email,
        role,
        status,
        last_accessed_at,
        organization:organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      activeMemebershipsQuery: {
        data: memberships,
        error,
        count: memberships?.length || 0
      },
      allMembershipsQuery: {
        data: allMemberships,
        error: allError,
        count: allMemberships?.length || 0
      }
    });

  } catch (error) {
    console.error('Debug memberships error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}