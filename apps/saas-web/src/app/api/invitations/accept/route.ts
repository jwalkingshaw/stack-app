import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/invitations/accept - Accept team invitation
export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Processing invitation acceptance');

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { invitation_token } = body;

    if (!invitation_token) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
        { status: 400 }
      );
    }

    console.log('🔑 Processing invitation token for user:', user.email);

    // Accept invitation using database function
    const { data: success, error: acceptError } = await supabase.rpc(
      'accept_team_invitation',
      {
        invitation_token_param: invitation_token,
        kinde_user_id_param: user.id,
        user_email: user.email
      }
    );

    if (acceptError) {
      console.error('Error accepting invitation:', acceptError);
      
      // Handle specific error messages
      if (acceptError.message?.includes('Invalid or expired invitation')) {
        return NextResponse.json(
          { error: 'This invitation link is invalid or has expired. Please request a new invitation.' },
          { status: 404 }
        );
      }
      
      if (acceptError.message?.includes('Email does not match')) {
        return NextResponse.json(
          { error: 'This invitation was sent to a different email address. Please log in with the correct account.' },
          { status: 403 }
        );
      }
      
      return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
    }

    // Get the organization details for the response
    const { data: memberInfo, error: memberError } = await supabase
      .from('organization_members')
      .select(`
        id,
        role,
        joined_at,
        organization_id,
        organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(1);

    if (memberError || !memberInfo || memberInfo.length === 0) {
      console.error('Error fetching member info after acceptance:', memberError);
      // Still return success since the invitation was accepted
      return NextResponse.json({
        success: true,
        message: 'Invitation accepted successfully! Please refresh the page.'
      });
    }

    const member = memberInfo[0];
    console.log('✅ Invitation accepted successfully. User joined:', member.organizations.name);

    return NextResponse.json({
      success: true,
      data: {
        member: {
          id: member.id,
          role: member.role,
          joined_at: member.joined_at
        },
        organization: {
          id: member.organization_id,
          name: member.organizations.name,
          slug: member.organizations.slug,
          redirect_url: `/${member.organizations.slug}/products`
        }
      },
      message: `Welcome to ${member.organizations.name}! You've been added as a ${member.role}.`
    });

  } catch (error) {
    console.error('Error in invitation acceptance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/invitations/accept?token=xxx - Get invitation details (for preview)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
        { status: 400 }
      );
    }

    console.log('👀 Getting invitation details for token preview');

    // Get invitation details
    const { data: invitation, error: invitationError } = await supabase
      .from('team_invitations')
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        organization_id,
        organizations (
          name,
          slug
        )
      `)
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .single();

    if (invitationError || !invitation) {
      console.error('Invitation not found or invalid:', invitationError);
      return NextResponse.json(
        { error: 'Invalid or expired invitation link' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    console.log('✅ Valid invitation found for:', invitation.organizations.name);

    return NextResponse.json({
      success: true,
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
          organization: {
            name: invitation.organizations.name,
            slug: invitation.organizations.slug
          }
        }
      }
    });

  } catch (error) {
    console.error('Error in invitation GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}