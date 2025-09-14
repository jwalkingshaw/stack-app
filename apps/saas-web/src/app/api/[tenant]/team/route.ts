import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { hasOrganizationAccess, setDatabaseUserContext } from '@/lib/user-context';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/team - List team members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    console.log('👥 Fetching team members for tenant:', tenant);

    // Get authenticated user
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user access to organization
    const access = await hasOrganizationAccess(tenant, 'view');
    if (!access.hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied. You do not have permission to view this team.' 
      }, { status: 403 });
    }

    // Set database context for RLS
    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    // Get team members
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        id,
        kinde_user_id,
        email,
        role,
        status,
        joined_at,
        created_at
      `)
      .eq('organization_id', access.organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (membersError) {
      console.error('Error fetching team members:', membersError);
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
    }

    // Get pending invitations (only for admins/owners)
    let invitations = [];
    if (access.accessLevel === 'admin' || access.accessType === 'owner') {
      const { data: pendingInvites, error: invitesError } = await supabase
        .from('team_invitations')
        .select(`
          id,
          email,
          role,
          status,
          expires_at,
          invited_by,
          created_at
        `)
        .eq('organization_id', access.organizationId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!invitesError) {
        invitations = pendingInvites || [];
      }
    }

    console.log(`✅ Found ${members?.length || 0} team members and ${invitations.length} pending invitations`);

    return NextResponse.json({
      success: true,
      data: {
        members: members || [],
        pending_invitations: invitations,
        organization: {
          id: access.organizationId,
          userRole: access.accessLevel,
          userAccessType: access.accessType
        }
      }
    });

  } catch (error) {
    console.error('Error in team GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/[tenant]/team - Invite new team member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    console.log('📨 Inviting team member for tenant:', tenant);

    // Get authenticated user
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user has admin access
    const access = await hasOrganizationAccess(tenant, 'admin');
    if (!access.hasAccess || !['admin', 'owner'].includes(access.accessLevel || '')) {
      return NextResponse.json({ 
        error: 'Access denied. You must be an admin or owner to invite team members.' 
      }, { status: 403 });
    }

    // Set database context for RLS
    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    // Parse request body
    const body = await request.json();
    const { email, role = 'member' } = body;

    // Validate input
    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Validate role
    if (!['member', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be either "member" or "admin"' },
        { status: 400 }
      );
    }

    console.log('📧 Creating invitation for:', { email: email.trim(), role, organizationId: access.organizationId });

    // Create invitation using database function
    const { data: invitationId, error: invitationError } = await supabase.rpc(
      'create_team_invitation',
      {
        org_id: access.organizationId,
        invite_email: email.trim().toLowerCase(),
        invite_role: role
      }
    );

    if (invitationError) {
      console.error('Error creating invitation:', invitationError);
      
      // Handle specific error messages
      if (invitationError.message?.includes('Pending invitation already exists')) {
        return NextResponse.json(
          { error: 'An invitation has already been sent to this email address' },
          { status: 409 }
        );
      }
      
      if (invitationError.message?.includes('User is already a member')) {
        return NextResponse.json(
          { error: 'This user is already a member of the organization' },
          { status: 409 }
        );
      }

      if (invitationError.message?.includes('Insufficient permissions')) {
        return NextResponse.json(
          { error: 'You do not have permission to invite team members' },
          { status: 403 }
        );
      }
      
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    // Get the created invitation details
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('id, email, role, invitation_token, expires_at, created_at')
      .eq('id', invitationId)
      .single();

    if (fetchError) {
      console.error('Error fetching invitation details:', fetchError);
      return NextResponse.json({ error: 'Invitation created but failed to retrieve details' }, { status: 500 });
    }

    console.log('✅ Team invitation created successfully:', invitation.id);

    // TODO: Send invitation email here
    // This would typically integrate with an email service like:
    // - Resend, SendGrid, AWS SES, etc.
    // - Include invitation link: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.invitation_token}

    return NextResponse.json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
          invitation_link: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${invitation.invitation_token}`
        }
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error in team POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}