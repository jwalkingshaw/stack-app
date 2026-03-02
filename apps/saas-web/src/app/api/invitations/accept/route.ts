import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { kindeAPI } from '@/lib/kinde-management';
import { syncKindeBillingRoleForMember } from '@/lib/kinde-billing-role-sync';
import { enforceRateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';
import { logRateLimitSecurityEvent } from '@/lib/security-audit';
import {
  isValidInvitationToken,
  isInvitationActionable,
  normalizeEmail,
} from '@/lib/invitation-security';
import {
  applyInvitePermissions,
  normalizeInvitePermissions,
} from '@/lib/invite-permissions';
import { assertBillingCapacity } from '@/lib/billing-policy';
import {
  applyInvitationShareSetGrants,
  loadInvitationShareSetAssignments,
} from '@/lib/invitation-share-sets';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const PENDING_INVITE_COOKIE = 'pending_invitation_token';
const POST_LOGIN_REDIRECT_COOKIE = 'post_login_redirect';

const cookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
};

const clearCookieOptions = {
  ...cookieOptions,
  maxAge: 0,
};

const setCookieOptions = (maxAge: number) => ({
  ...cookieOptions,
  maxAge,
});

const FIVE_MINUTES = 5 * 60;
const TEN_MINUTES = 10 * 60;

type InvitationRow = {
  id: string;
  email: string;
  role_or_access_level: string;
  invitation_type: 'team_member' | 'partner';
  organization_id: string;
  invited_by: string | null;
  partner_organization_id: string | null;
  requires_onboarding: boolean;
  permission_bundle_id: string | null;
  invite_permissions: Record<string, unknown> | null;
  expires_at: string | null;
  brand_org: {
    id: string;
    name: string;
    slug: string;
    kinde_org_id: string;
  } | null;
  partner_org: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

async function applyInvitationSetsOrFail(params: {
  invitation: InvitationRow;
  partnerOrganizationId: string;
  userId: string;
}) {
  const { invitation, partnerOrganizationId, userId } = params;
  const accessLevel = invitation.role_or_access_level === 'edit' ? 'edit' : 'view';

  const grantResult = await applyInvitationShareSetGrants({
    supabase,
    organizationId: invitation.organization_id,
    invitationId: invitation.id,
    partnerOrganizationId,
    accessLevel,
    grantedBy: invitation.invited_by || userId,
  });

  if (!grantResult.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: grantResult.error }, { status: grantResult.status }),
    };
  }

  return {
    ok: true as const,
    appliedCount: grantResult.data.appliedCount,
  };
}

function persistPendingInvitation(response: NextResponse, token: string) {
  response.cookies.set(
    PENDING_INVITE_COOKIE,
    token,
    setCookieOptions(TEN_MINUTES)
  );
  response.cookies.set(
    POST_LOGIN_REDIRECT_COOKIE,
    encodeURIComponent(`/invitations/accept?token=${token}`),
    setCookieOptions(TEN_MINUTES)
  );
}

function clearPendingInvitation(response: NextResponse) {
  response.cookies.set(PENDING_INVITE_COOKIE, '', clearCookieOptions);
  response.cookies.set(POST_LOGIN_REDIRECT_COOKIE, '', clearCookieOptions);
}

function invalidInvitationResponse() {
  return NextResponse.json(
    { error: 'Invitation is invalid or no longer available.' },
    { status: 404 }
  );
}

function buildWelcomeRedirect(slug?: string | null) {
  if (!slug) return null;
  return `/welcome?next=${encodeURIComponent(`/${slug}`)}`;
}

function isValidOrganizationId(id: string) {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

function jsonWithClear<T extends Record<string, unknown>>(
  payload: T,
  init?: ResponseInit
) {
  const response = NextResponse.json(payload, init);
  clearPendingInvitation(response);
  return response;
}

// POST /api/invitations/accept - Accept team or partner invitation
export async function POST(request: NextRequest) {
  try {
    console.log('[invitations] Processing invitation acceptance');

    const body = await request.json();
    const invitationToken = String(body?.invitation_token || '').trim();
    const requestedPartnerOrganizationId = String(
      body?.partner_organization_id || ''
    ).trim();

    if (!invitationToken) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
        { status: 400 }
      );
    }

    if (
      requestedPartnerOrganizationId &&
      !isValidOrganizationId(requestedPartnerOrganizationId)
    ) {
      return NextResponse.json(
        { error: 'partner_organization_id is invalid' },
        { status: 400 }
      );
    }

    if (!isValidInvitationToken(invitationToken)) {
      return invalidInvitationResponse();
    }

    const acceptRateLimit = await enforceRateLimit(request, {
      action: 'invitation_accept',
      token: invitationToken,
      windowSeconds: 60,
      maxRequests: 12,
    });
    if (!acceptRateLimit.allowed) {
      await logRateLimitSecurityEvent(supabase, {
        action: 'invitation_accept',
        userAgent: request.headers.get('user-agent'),
        metadata: {
          token_hint: invitationToken.slice(0, 8),
        },
      });
      return rateLimitExceededResponse(acceptRateLimit);
    }

    // Look up the invitation
    const { data: rawInvitation, error: invitationError } = await supabase
      .from('invitations')
      .select(`
        id,
        email,
        role_or_access_level,
        invitation_type,
        organization_id,
        invited_by,
        partner_organization_id,
        requires_onboarding,
        permission_bundle_id,
        invite_permissions,
        expires_at,
        brand_org:organizations!invitations_organization_id_fkey (
          id,
          name,
          slug,
          kinde_org_id
        ),
        partner_org:organizations!invitations_partner_organization_id_fkey (
          id,
          name,
          slug
        )
      `)
      .eq('token', invitationToken)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .single();

    if (invitationError || !rawInvitation) {
      console.error('Invitation not found:', invitationError);
      return invalidInvitationResponse();
    }

    const raw = rawInvitation as any;
    const invitation: InvitationRow = {
      ...raw,
      partner_organization_id: raw.partner_organization_id ?? null,
      invited_by: raw.invited_by ?? null,
      permission_bundle_id: raw.permission_bundle_id ?? null,
      invite_permissions: raw.invite_permissions ?? {},
      partner_org: Array.isArray(raw.partner_org)
        ? raw.partner_org[0] ?? null
        : raw.partner_org ?? null,
      brand_org: Array.isArray(raw.brand_org)
        ? raw.brand_org[0] ?? null
        : raw.brand_org ?? null,
    };

    const invitationShareSetSnapshot = await loadInvitationShareSetAssignments({
      supabase,
      organizationId: invitation.organization_id,
      invitationId: invitation.id,
    });
    if (!invitationShareSetSnapshot.ok) {
      return NextResponse.json(
        { error: invitationShareSetSnapshot.error },
        { status: invitationShareSetSnapshot.status }
      );
    }

    if (!isInvitationActionable(invitation)) {
      return invalidInvitationResponse();
    }

    const brandOrg = invitation.brand_org;
    if (!brandOrg?.kinde_org_id) {
      console.error('Organization missing Kinde org ID');
      return NextResponse.json(
        { error: 'Organization configuration error' },
        { status: 500 }
      );
    }

    // Ensure Kinde identity exists.
    // Team members are added to the brand Kinde org.
    // Partners are created/found in Kinde only; they should not be added to the brand org.
    try {
      if (invitation.invitation_type === 'team_member') {
        console.log(
          `[invitations] Ensuring team invite ${invitation.email} exists in Kinde org ${brandOrg.kinde_org_id}`
        );
        const result = await kindeAPI.inviteUserToOrganization(
          invitation.email,
          brandOrg.kinde_org_id
        );
        console.log(
          `[invitations] Team invite user ${
            result.isNewUser ? 'created and added' : 'added'
          } to Kinde organization`
        );
      } else {
        console.log(
          `[invitations] Ensuring partner invite identity exists in Kinde for ${invitation.email}`
        );
        const existingUser = await kindeAPI.getUserByEmail(invitation.email);
        if (!existingUser) {
          await kindeAPI.createUser(invitation.email);
          console.log('[invitations] Partner invite user created in Kinde');
        } else {
          console.log('[invitations] Partner invite user already exists in Kinde');
        }
      }
    } catch (error) {
      console.warn('[invitations] Unable to pre-create user in Kinde:', error);
    }

    const { getUser, getAccessToken } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      console.log('[invitations] User unauthenticated, caching invitation token');
      const response = NextResponse.json(
        {
          error: 'Unauthorized',
          requireLogin: true,
          login_hint: invitation.email,
        },
        { status: 401 }
      );
      persistPendingInvitation(response, invitationToken);
      return response;
    }

    const userNeedsProfile = !user.given_name || !user.family_name;

    if (normalizeEmail(user.email || '') !== normalizeEmail(invitation.email || '')) {
      const response = NextResponse.json(
        {
          error: 'Account mismatch',
          message: `This invitation is for ${invitation.email}. Please switch accounts to continue.`,
          login_hint: invitation.email,
        },
        { status: 403 }
      );
      persistPendingInvitation(response, invitationToken);
      return response;
    }

    // Safety cleanup: partner invitees should not remain members of the brand Kinde org.
    if (invitation.invitation_type === 'partner') {
      try {
        await kindeAPI.removeUserFromOrganization(brandOrg.kinde_org_id, user.id);
        console.log(
          `[invitations] Removed partner invitee ${user.id} from brand Kinde org ${brandOrg.kinde_org_id}`
        );
      } catch (cleanupError) {
        // Non-blocking: user may not be in the org, or removal may already be complete.
        console.warn('[invitations] Partner Kinde-org cleanup skipped:', cleanupError);
      }
    }

    // Verify recent authentication
    try {
      const accessToken = await getAccessToken();
      if (accessToken?.iat) {
        const issuedAt = accessToken.iat;
        const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
        if (ageSeconds > FIVE_MINUTES) {
          console.warn(
            `[invitations] Session older than five minutes (${Math.floor(
              ageSeconds / 60
            )} minutes), requesting re-authentication`
          );
          const response = NextResponse.json(
            {
              error: 'Fresh authentication required',
              message:
                'For security, please log in again to verify your email and accept this invitation.',
              requireReauth: true,
            },
            { status: 401 }
          );
          persistPendingInvitation(response, invitationToken);
          return response;
        }
      }
    } catch (error) {
      console.warn('[invitations] Unable to verify session age:', error);
    }

    // Team seats are hard-capped. Re-check at acceptance time in case limits changed
    // after invite creation or legacy invites bypassed create-time checks.
    if (invitation.invitation_type === 'team_member') {
      const { data: existingMembership, error: membershipLookupError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', invitation.organization_id)
        .eq('kinde_user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (membershipLookupError) {
        console.error('Failed to verify active membership before invitation acceptance:', membershipLookupError);
        return NextResponse.json(
          { error: 'Unable to verify membership status' },
          { status: 500 }
        );
      }

      if (!existingMembership) {
        const seatCapacity = await assertBillingCapacity({
          organizationId: invitation.organization_id,
          meter: 'internalUserCount',
        });

        if (!seatCapacity.allowed) {
          return jsonWithClear(
            {
              error:
                seatCapacity.message ||
                `You have reached your internal user limit (${seatCapacity.usage}/${seatCapacity.limit}). Upgrade your plan or purchase a seat add-on to continue.`,
              code: 'INTERNAL_USER_LIMIT_REACHED',
              limit: seatCapacity.limit,
              usage: seatCapacity.usage,
            },
            { status: 403 }
          );
        }
      }
    }

    // Accept invitation in Supabase
    const { data: acceptResult, error: acceptError } = await supabase.rpc(
      'accept_invitation',
      {
        invitation_token_param: invitationToken,
        kinde_user_id_param: user.id,
        user_email: user.email,
      }
    );

    if (acceptError) {
      console.error('Failed to accept invitation:', acceptError);

      if (acceptError.message?.includes('Invalid or expired invitation')) {
        return invalidInvitationResponse();
      }

      if (acceptError.message?.includes('Email does not match')) {
        const response = NextResponse.json(
          {
            error: 'Account mismatch',
            message: `This invitation is for ${invitation.email}. Please switch accounts to continue.`,
            login_hint: invitation.email,
          },
          { status: 403 }
        );
        persistPendingInvitation(response, invitationToken);
        return response;
      }

      return NextResponse.json(
        { error: 'Failed to accept invitation' },
        { status: 500 }
      );
    }

    console.log('[invitations] Invitation accepted via RPC');

    try {
      await supabase.rpc('log_security_event', {
        organization_id_param: invitation.organization_id,
        actor_user_id_param: user.id,
        action_param: 'invite.accepted',
        resource_type_param: 'invitation',
        resource_id_param: invitation.id,
        user_agent_param: request.headers.get('user-agent'),
        metadata_param: {
          invitation_type: invitation.invitation_type,
          invited_email: invitation.email,
          role_or_access_level: invitation.role_or_access_level,
          requires_onboarding: invitation.requires_onboarding,
        },
      });
    } catch (auditError) {
      console.warn('[invitations] Failed to write invitation accept audit event:', auditError);
    }

    const finalizePartnerInviteToOrganization = async (partnerOrg: {
      id: string;
      name?: string | null;
      slug?: string | null;
    }) => {
      const resolvedAccessLevel =
        invitation.role_or_access_level === 'edit' ? 'edit' : 'view';

      const { error: relationshipError } = await supabase
        .from('brand_partner_relationships')
        .upsert(
          {
            brand_organization_id: invitation.organization_id,
            partner_organization_id: partnerOrg.id,
            access_level: resolvedAccessLevel,
            invited_by: invitation.invited_by || user.id,
            status: 'active',
            status_updated_at: new Date().toISOString(),
          },
          { onConflict: 'brand_organization_id,partner_organization_id,status' }
        );

      if (relationshipError) {
        console.error(
          '[invitations] Failed to upsert partner relationship during invite acceptance:',
          relationshipError
        );
        return NextResponse.json(
          { error: 'Failed to establish brand-partner relationship' },
          { status: 500 }
        );
      }

      const { error: invitationFinalizeError } = await supabase
        .from('invitations')
        .update({
          partner_organization_id: partnerOrg.id,
          requires_onboarding: false,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null);

      if (invitationFinalizeError) {
        console.error(
          '[invitations] Failed to finalize partner invitation onboarding:',
          invitationFinalizeError
        );
        return NextResponse.json(
          { error: 'Failed to finalize invitation onboarding' },
          { status: 500 }
        );
      }

      const appliedPartnerPermissions = await applyInvitePermissions({
        supabase,
        organizationId: invitation.organization_id,
        userId: user.id,
        userEmail: user.email || invitation.email,
        invitedBy: invitation.invited_by,
        defaultRole: 'partner',
        permissions: invitation.invite_permissions || {},
      });

      if (!appliedPartnerPermissions.applied) {
        return NextResponse.json(
          { error: appliedPartnerPermissions.error || 'Failed to apply invite permissions' },
          { status: 500 }
        );
      }

      const shareSetGrantResult = await applyInvitationSetsOrFail({
        invitation,
        partnerOrganizationId: partnerOrg.id,
        userId: user.id,
      });
      if (!shareSetGrantResult.ok) {
        return shareSetGrantResult.response;
      }

      const partnerProfileRedirect = buildWelcomeRedirect(partnerOrg.slug);

      return jsonWithClear({
        success: true,
        data: {
          invitation_type: 'partner',
          requires_onboarding: false,
          invitation_token: invitationToken,
          invitation_id: invitation.id,
          permission_bundle_id: invitation.permission_bundle_id,
          invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
          invite_share_set_count: invitationShareSetSnapshot.data.shareSetIds.length,
          applied_share_set_grants: shareSetGrantResult.appliedCount,
          brand_organization_id: invitation.organization_id,
          partner_organization: {
            id: partnerOrg.id,
            name: partnerOrg.name,
            slug: partnerOrg.slug,
          },
          access_level: invitation.role_or_access_level,
          needs_profile: userNeedsProfile,
          profile_redirect_url: partnerProfileRedirect,
          redirect_url: partnerOrg.slug ? `/${partnerOrg.slug}/products` : undefined,
        },
        message: `You can now access this brand's content from your ${partnerOrg.name ?? 'partner'} dashboard.`,
      });
    };

    // Partner onboarding flow
    if (invitation.invitation_type === 'partner' && invitation.requires_onboarding) {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('organization_members')
        .select('organization_id, joined_at')
        .eq('kinde_user_id', user.id)
        .eq('status', 'active');

      if (membershipError) {
        console.error(
          '[invitations] Failed to load active memberships for partner onboarding recovery:',
          membershipError
        );
        return NextResponse.json(
          { error: 'Failed to resolve your partner workspace memberships' },
          { status: 500 }
        );
      }

      const candidateOrgIds = Array.from(
        new Set(
          (membershipRows || [])
            .map((row: any) => row.organization_id)
            .filter((orgId: unknown): orgId is string => typeof orgId === 'string')
        )
      );

      let partnerOrgs: Array<{ id: string; name: string | null; slug: string | null }> = [];
      if (candidateOrgIds.length > 0) {
        const { data: partnerOrgRows, error: partnerOrgsError } = await supabase
          .from('organizations')
          .select('id, name, slug, organization_type')
          .in('id', candidateOrgIds)
          .eq('organization_type', 'partner');

        if (partnerOrgsError) {
          console.error(
            '[invitations] Failed to load partner organizations during onboarding recovery:',
            partnerOrgsError
          );
          return NextResponse.json(
            { error: 'Failed to resolve your partner organizations' },
            { status: 500 }
          );
        }

        partnerOrgs = Array.isArray(partnerOrgRows)
          ? partnerOrgRows.map((org: any) => ({
              id: org.id,
              name: org.name ?? null,
              slug: org.slug ?? null,
            }))
          : [];
      }

      if (requestedPartnerOrganizationId) {
        const selectedPartnerOrg = partnerOrgs.find(
          (org) => org.id === requestedPartnerOrganizationId
        );
        if (!selectedPartnerOrg) {
          return NextResponse.json(
            {
              error:
                'You do not have active access to the selected partner organization.',
            },
            { status: 403 }
          );
        }

        return finalizePartnerInviteToOrganization(selectedPartnerOrg);
      }

      if (partnerOrgs.length === 1) {
        return finalizePartnerInviteToOrganization(partnerOrgs[0]);
      }

      const onboardingRedirect = `/onboarding?type=partner&brand_id=${invitation.organization_id}&access_level=${invitation.role_or_access_level}&token=${invitationToken}`;
      const profileRedirect = buildWelcomeRedirect(brandOrg.slug);

      if (partnerOrgs.length > 1) {
        return jsonWithClear({
          success: true,
          data: {
            invitation_type: 'partner',
            requires_onboarding: true,
            requires_partner_organization_selection: true,
            partner_organization_options: partnerOrgs,
            brand_organization_id: invitation.organization_id,
            brand_organization_slug: brandOrg.slug,
            access_level: invitation.role_or_access_level,
            permission_bundle_id: invitation.permission_bundle_id,
            invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
            invite_share_set_count: invitationShareSetSnapshot.data.shareSetIds.length,
            invitation_token: invitationToken,
            invitation_id: invitation.id,
            needs_profile: userNeedsProfile,
            profile_redirect_url: profileRedirect,
            redirect_url: onboardingRedirect,
          },
          message:
            'Select which partner workspace should receive this brand relationship, or create a new partner workspace.',
        });
      }

      return jsonWithClear({
        success: true,
        data: {
          invitation_type: 'partner',
          requires_onboarding: true,
          brand_organization_id: invitation.organization_id,
          brand_organization_slug: brandOrg.slug,
          access_level: invitation.role_or_access_level,
          permission_bundle_id: invitation.permission_bundle_id,
          invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
          invite_share_set_count: invitationShareSetSnapshot.data.shareSetIds.length,
          invitation_token: invitationToken,
          invitation_id: invitation.id,
          needs_profile: userNeedsProfile,
          profile_redirect_url: profileRedirect,
          redirect_url: onboardingRedirect,
        },
        message: "Please create your partner organization to access this brand's content.",
      });
    }

    // Partner with existing organization
    if (invitation.invitation_type === 'partner' && !invitation.requires_onboarding) {
      const partnerOrg = invitation.partner_org;
      let partnerData = partnerOrg;

      if (!partnerData && invitation.partner_organization_id) {
        const { data: fetchedPartner } = await supabase
          .from('organizations')
          .select('id, name, slug')
          .eq('id', invitation.partner_organization_id)
          .maybeSingle();
        partnerData = fetchedPartner as typeof partnerOrg;
      }

      const appliedPartnerPermissions = await applyInvitePermissions({
        supabase,
        organizationId: invitation.organization_id,
        userId: user.id,
        userEmail: user.email || invitation.email,
        invitedBy: invitation.invited_by,
        defaultRole: 'partner',
        permissions: invitation.invite_permissions || {},
      });

      if (!appliedPartnerPermissions.applied) {
        return NextResponse.json(
          { error: appliedPartnerPermissions.error || 'Failed to apply invite permissions' },
          { status: 500 }
        );
      }

      let appliedShareSetGrants = 0;
      if (partnerData?.id) {
        const shareSetGrantResult = await applyInvitationSetsOrFail({
          invitation,
          partnerOrganizationId: partnerData.id,
          userId: user.id,
        });
        if (!shareSetGrantResult.ok) {
          return shareSetGrantResult.response;
        }
        appliedShareSetGrants = shareSetGrantResult.appliedCount;
      }

      const partnerProfileRedirect = buildWelcomeRedirect(partnerData?.slug);

      return jsonWithClear({
        success: true,
        data: {
          invitation_type: 'partner',
          requires_onboarding: false,
          invitation_token: invitationToken,
          invitation_id: invitation.id,
          permission_bundle_id: invitation.permission_bundle_id,
          invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
          invite_share_set_count: invitationShareSetSnapshot.data.shareSetIds.length,
          applied_share_set_grants: appliedShareSetGrants,
          brand_organization_id: invitation.organization_id,
          partner_organization: partnerData,
          access_level: invitation.role_or_access_level,
          needs_profile: userNeedsProfile,
          profile_redirect_url: partnerProfileRedirect,
          redirect_url: partnerData?.slug
            ? `/${partnerData.slug}/products`
            : undefined,
        },
        message: `You can now access this brand's content from your ${partnerData?.name ?? 'partner'} dashboard.`,
      });
    }

    // Team member flow
    const { data: memberRows, error: memberError } = await supabase
      .from('organization_members')
      .select(`
        id,
        role,
        joined_at,
        organization_id,
        organization:organizations!organization_members_organization_id_fkey (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('organization_id', invitation.organization_id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(1);

    const member = memberRows?.[0] ?? null;

    const defaultRole = (invitation.role_or_access_level as 'admin' | 'editor' | 'viewer') || 'viewer';
    const appliedTeamPermissions = await applyInvitePermissions({
      supabase,
      organizationId: invitation.organization_id,
      userId: user.id,
      userEmail: user.email || invitation.email,
      invitedBy: invitation.invited_by,
      defaultRole,
      permissions: invitation.invite_permissions || {},
    });

    if (!appliedTeamPermissions.applied) {
      return NextResponse.json(
        { error: appliedTeamPermissions.error || 'Failed to apply invite permissions' },
        { status: 500 }
      );
    }

    await syncKindeBillingRoleForMember({
      kindeOrgId: invitation.brand_org?.kinde_org_id,
      kindeUserId: user.id,
      appRole: member?.role || defaultRole,
      status: 'active',
      context: 'invitation_accept_team_member',
    });

    if (memberError || !member) {
      console.error('Unable to load member record after acceptance:', memberError);
      return jsonWithClear({
        success: true,
        data: {
          invitation_type: 'team_member',
          invitation_token: invitationToken,
        invitation_id: invitation.id,
        permission_bundle_id: invitation.permission_bundle_id,
        invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
        needs_profile: userNeedsProfile,
      },
        message: 'Invitation accepted successfully! Please refresh the page.',
      });
    }

    const orgData = Array.isArray(member.organization)
      ? member.organization[0]
      : member.organization;
    const orgRedirect = orgData?.slug ? `/${orgData.slug}/products` : null;
    const profileRedirect = buildWelcomeRedirect(orgData?.slug);

    return jsonWithClear({
      success: true,
      data: {
        invitation_type: 'team_member',
        invitation_token: invitationToken,
        invitation_id: invitation.id,
        permission_bundle_id: invitation.permission_bundle_id,
        invite_permissions: normalizeInvitePermissions(invitation.invite_permissions),
        needs_profile: userNeedsProfile,
        profile_redirect_url: profileRedirect,
        member: {
          id: member.id,
          role: member.role,
          joined_at: member.joined_at,
        },
        organization: {
          id: member.organization_id,
          name: orgData?.name,
          slug: orgData?.slug,
          redirect_url: orgRedirect,
        },
      },
      message: `Welcome to ${orgData?.name}! You've been added as a ${member.role}.`,
    });
  } catch (error) {
    console.error('Error in invitation acceptance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/invitations/accept?token=xxx - Invitation preview
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = String(searchParams.get('token') || '').trim();

    if (!token) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
        { status: 400 }
      );
    }

    if (!isValidInvitationToken(token)) {
      return invalidInvitationResponse();
    }

    const previewRateLimit = await enforceRateLimit(request, {
      action: 'invitation_preview',
      token,
      windowSeconds: 60,
      maxRequests: 30,
    });
    if (!previewRateLimit.allowed) {
      await logRateLimitSecurityEvent(supabase, {
        action: 'invitation_preview',
        userAgent: request.headers.get('user-agent'),
        metadata: {
          token_hint: token.slice(0, 8),
        },
      });
      return rateLimitExceededResponse(previewRateLimit);
    }

    console.log('[invitations] Loading invitation details for preview');

    const { data: rawInvitation, error: invitationError } = await supabase
      .from('invitations')
      .select(`
        id,
        email,
        role_or_access_level,
        invitation_type,
        expires_at,
        requires_onboarding,
        organization_id,
        brand_org:organizations!invitations_organization_id_fkey (
          name,
          slug,
          kinde_org_id
        )
      `)
      .eq('token', token)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .single();

    if (invitationError || !rawInvitation) {
      console.error('Invitation not found or invalid:', invitationError);
      return invalidInvitationResponse();
    }

    const raw = rawInvitation as any;
    const invitation: InvitationRow = {
      ...raw,
      partner_organization_id: raw.partner_organization_id ?? null,
      partner_org: Array.isArray(raw.partner_org)
        ? raw.partner_org[0] ?? null
        : raw.partner_org ?? null,
      brand_org: Array.isArray(raw.brand_org)
        ? raw.brand_org[0] ?? null
        : raw.brand_org ?? null,
    };

    if (!isInvitationActionable(invitation)) {
      return invalidInvitationResponse();
    }

    console.log('[invitations] Invitation valid for organization:', invitation.brand_org?.name);

    return NextResponse.json({
      success: true,
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role_or_access_level,
          type: invitation.invitation_type,
          requires_onboarding: invitation.requires_onboarding,
          expires_at: invitation.expires_at,
          organization: {
            name: invitation.brand_org?.name,
            slug: invitation.brand_org?.slug,
            kinde_org_id: invitation.brand_org?.kinde_org_id,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error in invitation GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


