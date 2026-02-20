import { NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { DatabaseQueries } from '@tradetool/database';
import { supabaseServer } from '@/lib/supabase';
import { enforceRateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';
import { logRateLimitSecurityEvent } from '@/lib/security-audit';
import {
  isValidInvitationToken,
  normalizeEmail,
} from '@/lib/invitation-security';
import { applyInvitePermissions, normalizeInvitePermissions } from '@/lib/invite-permissions';
import { applyInvitationShareSetGrants } from '@/lib/invitation-share-sets';

const db = new DatabaseQueries(supabaseServer);

function invalidInvitationResponse() {
  return NextResponse.json(
    { error: 'Invitation is invalid or no longer available.' },
    { status: 404 }
  );
}

// POST /api/partner-relationships/create
// Create a brand-partner relationship
export async function POST(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      brand_organization_id,
      partner_organization_id,
      access_level = 'view',
      invitation_token: rawInvitationToken,
    } = body;
    const invitation_token = String(rawInvitationToken || '').trim();

    // Validate input
    if (!brand_organization_id || !partner_organization_id) {
      return NextResponse.json(
        { error: 'brand_organization_id and partner_organization_id are required' },
        { status: 400 }
      );
    }

    if (!invitation_token) {
      return NextResponse.json(
        { error: 'invitation_token is required to finalize onboarding' },
        { status: 400 }
      );
    }
    if (!isValidInvitationToken(invitation_token)) {
      return invalidInvitationResponse();
    }

    const createRateLimit = await enforceRateLimit(request, {
      action: 'partner_relationship_create',
      token: invitation_token,
      userId: user.id,
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (!createRateLimit.allowed) {
      await logRateLimitSecurityEvent(supabaseServer, {
        action: 'partner_relationship_create',
        actorUserId: user.id,
        userAgent: request.headers.get('user-agent'),
        metadata: {
          token_hint: invitation_token.slice(0, 8),
        },
      });
      return rateLimitExceededResponse(createRateLimit);
    }

    // Validate access level
    if (!['view', 'edit'].includes(access_level)) {
      return NextResponse.json(
        { error: 'access_level must be "view" or "edit"' },
        { status: 400 }
      );
    }

    console.log('🤝 Creating brand-partner relationship:', {
      brandOrgId: brand_organization_id,
      partnerOrgId: partner_organization_id,
      accessLevel: access_level,
      userId: user.id
    });

    const { data: invitation, error: invitationError } = await (supabaseServer as any)
      .from('invitations')
      .select(`
        id,
        email,
        organization_id,
        partner_organization_id,
        requires_onboarding,
        invitation_type,
        role_or_access_level,
        invited_by,
        permission_bundle_id,
        invite_permissions
      `)
      .eq('token', invitation_token)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .single();

    if (invitationError || !invitation) {
      console.error('Invitation not found or already processed:', invitationError);
      return invalidInvitationResponse();
    }

    if (invitation.invitation_type !== 'partner') {
      return invalidInvitationResponse();
    }

    if (invitation.organization_id !== brand_organization_id) {
      return invalidInvitationResponse();
    }

    if (normalizeEmail(invitation.email || '') !== normalizeEmail(user.email || '')) {
      return invalidInvitationResponse();
    }

    if (!invitation.requires_onboarding) {
      console.warn('Partner invitation does not require onboarding; continuing with finalization.');
    }

    if (invitation.partner_organization_id && invitation.partner_organization_id !== partner_organization_id) {
      return invalidInvitationResponse();
    }

    const resolvedAccessLevel =
      invitation.role_or_access_level === 'edit' ? 'edit' : 'view';

    if (access_level !== resolvedAccessLevel) {
      console.warn('Access level override ignored; using invitation-defined level:', resolvedAccessLevel);
    }

    // Verify user is a member of the partner organization
    const partnerMembership = await db.getOrganizationMember(user.id, partner_organization_id);

    if (!partnerMembership) {
      return NextResponse.json(
        { error: 'You must be a member of the partner organization' },
        { status: 403 }
      );
    }

    // Check if relationship already exists
    const existingRelationship = await db.hasPartnerAccess(brand_organization_id, partner_organization_id);
    if (existingRelationship) {
      console.log('Relationship already exists');
      await db.updatePartnerAccessLevel(
        brand_organization_id,
        partner_organization_id,
        resolvedAccessLevel
      );

      const { error: invitationUpdateError } = await (supabaseServer as any)
        .from('invitations')
        .update({
          partner_organization_id,
          requires_onboarding: false,
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .select('id')
        .single();

      if (invitationUpdateError) {
        console.error('Error updating invitation after existing relationship:', invitationUpdateError);
        return invalidInvitationResponse();
      }

      const appliedPermissions = await applyInvitePermissions({
        supabase: supabaseServer,
        organizationId: brand_organization_id,
        userId: user.id,
        userEmail: user.email || invitation.email,
        invitedBy: invitation.invited_by,
        defaultRole: 'partner',
        permissions: invitation.invite_permissions || {},
      });

      if (!appliedPermissions.applied) {
        return NextResponse.json(
          { error: appliedPermissions.error || 'Failed to apply invite permissions' },
          { status: 500 }
        );
      }

      const inviteSetGrants = await applyInvitationShareSetGrants({
        supabase: supabaseServer,
        organizationId: brand_organization_id,
        invitationId: invitation.id,
        partnerOrganizationId: partner_organization_id,
        accessLevel: resolvedAccessLevel,
        grantedBy: invitation.invited_by || user.id,
      });
      if (!inviteSetGrants.ok) {
        return NextResponse.json(
          { error: inviteSetGrants.error },
          { status: inviteSetGrants.status }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          brand_organization_id,
          partner_organization_id,
          access_level: resolvedAccessLevel,
          invitation_id: invitation.id,
          permission_bundle_id: invitation.permission_bundle_id ?? null,
          invite_permissions: normalizeInvitePermissions(invitation.invite_permissions ?? {}),
          applied_share_set_grants: inviteSetGrants.data.appliedCount,
        },
        message: 'Relationship already exists'
      });
    }
    const created = await db.createBrandPartnerRelationship({
      brandOrganizationId: brand_organization_id,
      partnerOrganizationId: partner_organization_id,
      accessLevel: resolvedAccessLevel,
      invitedBy: invitation.invited_by || user.id,
    });

    if (!created) {
      const updated = await db.updatePartnerAccessLevel(
        brand_organization_id,
        partner_organization_id,
        resolvedAccessLevel
      );

      if (!updated) {
        throw new Error('Failed to create brand-partner relationship');
      }
    }

    const { error: invitationUpdateError } = await (supabaseServer as any)
      .from('invitations')
      .update({
        partner_organization_id,
        requires_onboarding: false,
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .select('id')
      .single();

    if (invitationUpdateError) {
      console.error('Error updating invitation after relationship creation:', invitationUpdateError);
      throw new Error('Unable to update invitation status');
    }
    const appliedPermissions = await applyInvitePermissions({
      supabase: supabaseServer,
      organizationId: brand_organization_id,
      userId: user.id,
      userEmail: user.email || invitation.email,
      invitedBy: invitation.invited_by,
      defaultRole: 'partner',
      permissions: invitation.invite_permissions || {},
    });

    if (!appliedPermissions.applied) {
      return NextResponse.json(
        { error: appliedPermissions.error || 'Failed to apply invite permissions' },
        { status: 500 }
      );
    }

    const inviteSetGrants = await applyInvitationShareSetGrants({
      supabase: supabaseServer,
      organizationId: brand_organization_id,
      invitationId: invitation.id,
      partnerOrganizationId: partner_organization_id,
      accessLevel: resolvedAccessLevel,
      grantedBy: invitation.invited_by || user.id,
    });
    if (!inviteSetGrants.ok) {
      return NextResponse.json(
        { error: inviteSetGrants.error },
        { status: inviteSetGrants.status }
      );
    }

    const { data: partnerOrg } = await (supabaseServer as any)
      .from('organizations')
      .select('id, name, slug')
      .eq('id', partner_organization_id)
      .single();

    console.log('Partner relationship established successfully');

    return NextResponse.json({
      success: true,
      data: {
        brand_organization_id,
        partner_organization_id,
        access_level: resolvedAccessLevel,
        invitation_id: invitation.id,
        permission_bundle_id: invitation.permission_bundle_id ?? null,
        invite_permissions: normalizeInvitePermissions(invitation.invite_permissions ?? {}),
        applied_share_set_grants: inviteSetGrants.data.appliedCount,
        partner_organization: partnerOrg,
        redirect_url: partnerOrg?.slug ? `/${partnerOrg.slug}` : undefined
      },
      message: 'Partner relationship established successfully'
    });

  } catch (error) {
    console.error('Error creating partner relationship:', error);
    return NextResponse.json(
      { error: 'Failed to create partner relationship' },
      { status: 500 }
    );
  }
}
