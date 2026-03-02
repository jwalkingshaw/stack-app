import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@tradetool/auth';
import { DatabaseQueries } from '@tradetool/database';

import { supabaseServer } from '@/lib/supabase';
import { sendInvitationEmail } from '@/lib/email';
import { enforceRateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';
import { requireTenantAccess } from '@/lib/tenant-auth';
import { logRateLimitSecurityEvent } from '@/lib/security-audit';
import { canRevokeInvite, canSendInvite } from '@/lib/security-permissions';
import { assertBillingCapacity } from '@/lib/billing-policy';
import {
  normalizeInvitePermissions,
  validateInvitePermissionsForOrganization,
} from '@/lib/invite-permissions';
import {
  normalizeShareSetIds,
  replaceInvitationShareSetAssignments,
  validateShareSetIdsForOrganization,
} from '@/lib/invitation-share-sets';

function isMissingColumnError(error: any): boolean {
  return error?.code === '42703';
}

function normalizeRelationshipAccessLevel(row: any): 'view' | 'edit' {
  const direct = typeof row?.access_level === 'string' ? row.access_level.toLowerCase() : '';
  if (direct === 'edit' || direct === 'view') {
    return direct;
  }

  const permissions = row?.permissions;
  if (permissions && typeof permissions === 'object') {
    const fromPermissions =
      typeof permissions.access_level === 'string'
        ? permissions.access_level.toLowerCase()
        : '';
    if (fromPermissions === 'edit' || fromPermissions === 'view') {
      return fromPermissions;
    }
    if (permissions.edit === true || permissions.can_edit === true || permissions.write === true) {
      return 'edit';
    }
  }

  return 'view';
}

function normalizeOrganizationType(organization: any): 'brand' | 'partner' {
  const raw =
    organization?.organizationType ??
    organization?.type ??
    organization?.organization_type ??
    'brand';
  return String(raw).toLowerCase() === 'partner' ? 'partner' : 'brand';
}

async function countPendingInvitesForType(
  organizationId: string,
  invitationType: 'team_member' | 'partner'
): Promise<number> {
  const nowIso = new Date().toISOString();

  let result = await (supabaseServer as any)
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('invitation_type', invitationType)
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso);

  // Backward compatibility for schemas before revoked_at.
  if (result.error?.code === '42703') {
    result = await (supabaseServer as any)
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('invitation_type', invitationType)
      .is('accepted_at', null)
      .is('declined_at', null)
      .gt('expires_at', nowIso);
  }

  if (result.error) {
    console.error('Error counting pending invites:', result.error);
    return 0;
  }
  return result.count || 0;
}

// GET /api/[tenant]/team - List team members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }
    const { organization, userId } = tenantAccess;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = await authService.getUserPermissions(userId, organization.id);
    const members = await db.getOrganizationMembers(organization.id);

    let invitations: any[] = [];
    let partnerRelationships: any[] = [];
    const canManageInvites = permissions.is_admin || permissions.is_owner;

    if (canManageInvites) {
      const { data: pendingInvites, error: invitesError } = await (supabaseServer as any)
        .from('invitations')
        .select(`
          id,
          email,
          role_or_access_level,
          invitation_type,
          token,
          expires_at,
          invited_by,
          created_at
        `)
        .eq('organization_id', organization.id)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!invitesError) {
        invitations = pendingInvites || [];
      }
    }

    const organizationType = normalizeOrganizationType(organization);

    if (organizationType === 'brand') {
      let rawRelationships: Array<any> = [];
      let rpcPartnerRows: Array<any> = [];
      const relationshipQueryAttempts: Array<{
        select: string;
        brandColumn: string;
        partnerColumn: string;
      }> = [
        {
          select: 'id,partner_organization_id,status,access_level,created_at,updated_at',
          brandColumn: 'brand_organization_id',
          partnerColumn: 'partner_organization_id',
        },
        {
          select:
            'id,partner_organization_id,status,access_level,created_at,status_updated_at',
          brandColumn: 'brand_organization_id',
          partnerColumn: 'partner_organization_id',
        },
        {
          select: 'id,partner_organization_id,status,permissions,created_at,updated_at',
          brandColumn: 'brand_organization_id',
          partnerColumn: 'partner_organization_id',
        },
        {
          select:
            'id,partner_organization_id,status,permissions,created_at,status_updated_at',
          brandColumn: 'brand_organization_id',
          partnerColumn: 'partner_organization_id',
        },
        {
          select: 'id,partner_id,status,access_level,created_at,updated_at',
          brandColumn: 'brand_id',
          partnerColumn: 'partner_id',
        },
        {
          select: 'id,partner_id,status,permissions,created_at,updated_at',
          brandColumn: 'brand_id',
          partnerColumn: 'partner_id',
        },
      ];

      for (const attempt of relationshipQueryAttempts) {
        const result = await (supabaseServer as any)
          .from('brand_partner_relationships')
          .select(attempt.select)
          .eq(attempt.brandColumn, organization.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (!result.error) {
          rawRelationships = ((result.data || []) as Array<any>)
            .map((row) => ({
              id: row.id,
              partner_organization_id: row[attempt.partnerColumn],
              status: row.status || 'active',
              access_level: normalizeRelationshipAccessLevel(row),
              created_at: row.created_at || null,
              updated_at: row.updated_at || row.status_updated_at || row.created_at || null,
            }))
            .filter((row) => Boolean(row.partner_organization_id));
          break;
        }

        if (!isMissingColumnError(result.error)) {
          console.error('Error loading partner relationships:', result.error);
          break;
        }
      }

      if (rawRelationships.length === 0) {
        const rpcPartners = await (supabaseServer as any).rpc('get_brand_partners', {
          brand_org_id: organization.id,
        });
        if (!rpcPartners.error && Array.isArray(rpcPartners.data)) {
          rpcPartnerRows = rpcPartners.data as Array<any>;
          rawRelationships = rpcPartnerRows
            .map((row) => ({
              id: row.partner_id || crypto.randomUUID(),
              partner_organization_id: row.partner_id,
              status: row.relationship_status || 'active',
              access_level: normalizeRelationshipAccessLevel({
                access_level: row.access_level,
                permissions: row.permissions,
              }),
              created_at: row.relationship_created_at || null,
              updated_at: row.relationship_created_at || null,
            }))
            .filter((row) => Boolean(row.partner_organization_id));
        }
      }

      const partnerOrgIds = Array.from(
        new Set(
          rawRelationships
            .map((row) => row.partner_organization_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let partnersById = new Map<string, any>();
      if (rpcPartnerRows.length > 0) {
        partnersById = new Map(
          rpcPartnerRows
            .filter((row) => Boolean(row.partner_id))
            .map((row) => [
              row.partner_id,
              {
                id: row.partner_id,
                name: row.partner_name || row.partner_id,
                slug: row.partner_slug || null,
                partner_category: null,
                organization_type: 'partner',
              },
            ])
        );
      }
      if (partnerOrgIds.length > 0) {
        const { data: partnerRows } = await (supabaseServer as any)
          .from('organizations')
          .select('id,name,slug,partner_category,organization_type')
          .in('id', partnerOrgIds);

        partnersById = new Map(
          ((partnerRows || []) as Array<any>).map((row) => [row.id, row])
        );
      }

      let setCountByPartner = new Map<string, number>();
      if (partnerOrgIds.length > 0) {
        const grants = await (supabaseServer as any)
          .from('partner_share_set_grants')
          .select('partner_organization_id,share_set_id')
          .eq('organization_id', organization.id)
          .eq('status', 'active')
          .in('partner_organization_id', partnerOrgIds);

        if (!grants.error) {
          const setIdsByPartner = new Map<string, Set<string>>();
          for (const row of (grants.data || []) as Array<any>) {
            const partnerId = row.partner_organization_id;
            const shareSetId = row.share_set_id;
            if (!partnerId || !shareSetId) continue;
            const current = setIdsByPartner.get(partnerId) || new Set<string>();
            current.add(shareSetId);
            setIdsByPartner.set(partnerId, current);
          }
          setCountByPartner = new Map(
            Array.from(setIdsByPartner.entries()).map(([partnerId, setIds]) => [
              partnerId,
              setIds.size,
            ])
          );
        }
      }

      partnerRelationships = rawRelationships.map((relationship) => {
        const partner = partnersById.get(relationship.partner_organization_id) || null;
        return {
          ...relationship,
          partner_organization: partner
            ? {
                id: partner.id,
                name: partner.name,
                slug: partner.slug,
                partner_category: partner.partner_category || null,
                organization_type: partner.organization_type || null,
              }
            : null,
          share_set_count:
            setCountByPartner.get(relationship.partner_organization_id) || 0,
        };
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        members,
        pending_invitations: invitations,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          organization_type: organizationType,
          partner_category: organization.partnerCategory ?? null,
        },
        partner_relationships: partnerRelationships,
        user_permissions: permissions,
      },
    });
  } catch (error) {
    console.error('Error in team GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/[tenant]/team - Invite new team member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteLimit = await enforceRateLimit(request, {
      action: 'team_invite_create',
      tenant: resolvedParams.tenant,
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (!inviteLimit.allowed) {
      await logRateLimitSecurityEvent(supabaseServer, {
        action: 'team_invite_create',
        userAgent: request.headers.get('user-agent'),
        metadata: { tenant: resolvedParams.tenant },
      });
      return rateLimitExceededResponse(inviteLimit);
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }
    const { organization, userId } = tenantAccess;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canInvite = await canSendInvite({
      authService,
      userId,
      organizationId: organization.id,
    });

    if (!canInvite) {
      return NextResponse.json(
        {
          error: 'Access denied. You must be an admin or owner to invite team members.',
        },
        { status: 403 }
      );
    }

    const organizationType = normalizeOrganizationType(organization);

    const currentUser = await authService.getCurrentUser();
    const inviterDisplayName = currentUser?.name || currentUser?.email || userId;

    const body = await request.json();
    const {
      email,
      role = 'viewer',
      invitation_type = 'team_member',
      access_level = 'view',
      permission_bundle_id = null,
      invite_permissions = {},
      share_set_ids = [],
    } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please provide a valid email address' }, { status: 400 });
    }

    const trimmedEmail = email.trim();
    const normalizedEmail = trimmedEmail.toLowerCase();

    const normalizedInvitePermissions = normalizeInvitePermissions(invite_permissions);
    const permissionsValidation = await validateInvitePermissionsForOrganization({
      supabase: supabaseServer,
      organizationId: organization.id,
      permissions: normalizedInvitePermissions,
    });
    if (!permissionsValidation.valid) {
      return NextResponse.json({ error: permissionsValidation.error }, { status: 400 });
    }

    if (permission_bundle_id) {
      const { data: bundle, error: bundleError } = await (supabaseServer as any)
        .from('permission_bundles')
        .select('id')
        .eq('id', permission_bundle_id)
        .eq('organization_id', organization.id)
        .maybeSingle();

      if (bundleError || !bundle) {
        return NextResponse.json(
          { error: 'Invalid permission bundle for this workspace.' },
          { status: 400 }
        );
      }
    }

    const validInvitationTypes = ['team_member', 'partner'];
    if (!validInvitationTypes.includes(invitation_type)) {
      return NextResponse.json(
        { error: 'Invitation type must be one of: team_member, partner' },
        { status: 400 }
      );
    }

    if (invitation_type === 'partner' && organizationType !== 'brand') {
      return NextResponse.json(
        {
          error:
            'Only brand organizations can invite partner organizations. Partner workspaces can invite internal team members only.',
        },
        { status: 403 }
      );
    }

    if (invitation_type === 'team_member') {
      const validRoles = ['admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Role must be one of: admin, editor, viewer' },
          { status: 400 }
        );
      }
    }

    if (invitation_type === 'partner') {
      const validAccessLevels = ['view', 'edit'];
      if (!validAccessLevels.includes(access_level)) {
        return NextResponse.json(
          { error: 'Access level must be one of: view, edit' },
          { status: 400 }
        );
      }
    }

    if (invitation_type === 'team_member') {
      const [seatCapacity, pendingTeamInvites] = await Promise.all([
        assertBillingCapacity({
          organizationId: organization.id,
          meter: 'internalUserCount',
        }),
        countPendingInvitesForType(organization.id, 'team_member'),
      ]);

      if (seatCapacity.limit < Number.MAX_SAFE_INTEGER) {
        const projectedTotal = seatCapacity.usage + pendingTeamInvites + 1;
        if (projectedTotal > seatCapacity.limit) {
          return NextResponse.json(
            {
              error: `You have reached your internal user limit (${seatCapacity.usage}/${seatCapacity.limit}) including pending team invites. Upgrade your plan or purchase a seat add-on to continue.`,
              code: 'INTERNAL_USER_LIMIT_REACHED',
              limit: seatCapacity.limit,
              usage: seatCapacity.usage,
              pendingInvites: pendingTeamInvites,
            },
            { status: 403 }
          );
        }
      }
    }

    if (invitation_type === 'partner') {
      const partnerInviteCapacity = await assertBillingCapacity({
        organizationId: organization.id,
        meter: 'partnerInviteCount',
      });

      if (!partnerInviteCapacity.allowed) {
        return NextResponse.json(
          {
            error: partnerInviteCapacity.message,
            code: 'EXTERNAL_INVITE_LIMIT_REACHED',
            limit: partnerInviteCapacity.limit,
            usage: partnerInviteCapacity.usage,
          },
          { status: 403 }
        );
      }
    }

    const normalizedShareSetIds = normalizeShareSetIds(share_set_ids);
    if (invitation_type !== 'partner' && normalizedShareSetIds.length > 0) {
      return NextResponse.json(
        { error: 'Set assignment is only supported for partner invitations.' },
        { status: 400 }
      );
    }

    const shareSetValidation = await validateShareSetIdsForOrganization({
      supabase: supabaseServer,
      organizationId: organization.id,
      shareSetIds: normalizedShareSetIds,
    });
    if (!shareSetValidation.ok) {
      return NextResponse.json(
        { error: shareSetValidation.error },
        { status: shareSetValidation.status }
      );
    }

    const { data: existingMemberRows, error: existingMemberLookupError } = await (supabaseServer as any)
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('status', 'active')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingMemberLookupError) {
      console.error('Error checking existing member:', existingMemberLookupError);
      return NextResponse.json({ error: 'Could not verify existing membership' }, { status: 500 });
    }

    const existingMember = existingMemberRows?.[0] ?? null;
    if (existingMember && invitation_type === 'team_member') {
      return NextResponse.json(
        { error: 'This user is already a member of the organization' },
        { status: 409 }
      );
    }

    let partnerOrganizationId: string | null = null;
    let requiresOnboarding = false;

    if (invitation_type === 'partner') {
      const { data: existingPartnerMember, error: partnerCheckError } = await (supabaseServer as any)
        .from('organization_members')
        .select(`
          organization_id,
          organizations!inner(id, organization_type, name, slug)
        `)
        .eq('email', normalizedEmail)
        .eq('status', 'active')
        .eq('organizations.organization_type', 'partner')
        .single();

      if (existingPartnerMember && !partnerCheckError) {
        partnerOrganizationId = existingPartnerMember.organization_id;
        requiresOnboarding = false;
      } else {
        requiresOnboarding = true;
      }

      if (partnerOrganizationId) {
        const hasAccess = await db.hasPartnerAccess(organization.id, partnerOrganizationId);
        if (hasAccess) {
          return NextResponse.json(
            { error: 'This partner organization already has access to your brand' },
            { status: 409 }
          );
        }
      }
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitationData: any = {
      email: normalizedEmail,
      organization_id: organization.id,
      invitation_type,
      invited_by: userId,
      token,
      expires_at: expiresAt.toISOString(),
      permission_bundle_id: permission_bundle_id || null,
      invite_permissions: normalizedInvitePermissions,
    };

    if (invitation_type === 'team_member') {
      invitationData.role_or_access_level = role;
    } else {
      invitationData.role_or_access_level = access_level;
      invitationData.partner_organization_id = partnerOrganizationId;
      invitationData.requires_onboarding = requiresOnboarding;
    }

    const { data: invitation, error: invitationError } = await (supabaseServer as any)
      .from('invitations')
      .insert(invitationData)
      .select()
      .single();

    if (invitationError) {
      console.error('Error creating invitation:', invitationError);
      if ((invitationError as any).code === '23505') {
        return NextResponse.json(
          { error: 'A pending invitation already exists for this email and role scope.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    let assignedShareSetIds: string[] = [];
    if (invitation_type === 'partner' && shareSetValidation.data.validatedIds.length > 0) {
      const assignmentResult = await replaceInvitationShareSetAssignments({
        supabase: supabaseServer,
        organizationId: organization.id,
        invitationId: invitation.id,
        shareSetIds: shareSetValidation.data.validatedIds,
        createdBy: userId,
      });

      if (!assignmentResult.ok) {
        // Keep invitation + assignment setup consistent on initial create failures.
        await (supabaseServer as any)
          .from('invitations')
          .delete()
          .eq('id', invitation.id);

        return NextResponse.json(
          { error: assignmentResult.error },
          { status: assignmentResult.status }
        );
      }

      assignedShareSetIds = shareSetValidation.data.validatedIds;
    }

    try {
      await (supabaseServer as any).rpc('log_security_event', {
        organization_id_param: organization.id,
        actor_user_id_param: userId,
        action_param: 'invite.created',
        resource_type_param: 'invitation',
        resource_id_param: invitation.id,
        user_agent_param: request.headers.get('user-agent'),
        metadata_param: {
          invitation_type,
          invited_email: normalizedEmail,
          role_or_access_level: invitation.role_or_access_level,
          invite_permissions: normalizedInvitePermissions,
          permission_bundle_id: permission_bundle_id || null,
          invite_share_set_count: assignedShareSetIds.length,
        },
      });
    } catch (auditError) {
      console.warn('Failed to write invite-created audit event:', auditError);
    }

    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/invitations/accept?token=${token}`;

    try {
      await sendInvitationEmail({
        to: invitation.email,
        organizationName: organization.name,
        inviterName: inviterDisplayName,
        role: invitation.role_or_access_level,
        invitationUrl,
      });
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
    }

    const responseMessage =
      invitation_type === 'partner'
        ? requiresOnboarding
          ? `Partner invitation sent to ${email}. They will need to create a partner organization to access your content.`
          : `Partner invitation sent to ${email}. They will be able to access your content from their existing partner organization.`
        : `Team invitation sent to ${email}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          invitation: {
            id: invitation.id,
            email: invitation.email,
            type: invitation.invitation_type,
            role: invitation.role_or_access_level,
            expires_at: invitation.expires_at,
            invitation_link: invitationUrl,
            requires_onboarding: requiresOnboarding,
            partner_organization_id: partnerOrganizationId,
            permission_bundle_id: invitation.permission_bundle_id,
            invite_permissions: invitation.invite_permissions,
            share_set_ids: assignedShareSetIds,
            share_set_count: assignedShareSetIds.length,
          },
        },
        message: responseMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in team POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/[tenant]/team?invitationId=xxx - Revoke pending invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteDeleteLimit = await enforceRateLimit(request, {
      action: 'team_invite_delete',
      tenant: resolvedParams.tenant,
      windowSeconds: 60,
      maxRequests: 30,
    });
    if (!inviteDeleteLimit.allowed) {
      await logRateLimitSecurityEvent(supabaseServer, {
        action: 'team_invite_delete',
        userAgent: request.headers.get('user-agent'),
        metadata: { tenant: resolvedParams.tenant },
      });
      return rateLimitExceededResponse(inviteDeleteLimit);
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }
    const { organization, userId } = tenantAccess;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canDeleteInvite = await canRevokeInvite({
      authService,
      userId,
      organizationId: organization.id,
    });

    if (!canDeleteInvite) {
      return NextResponse.json(
        {
          error: 'Access denied. You must be an admin or owner to delete invitations.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const invitationId = searchParams.get('invitationId');

    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    const { data: invitation, error: fetchError } = await (supabaseServer as any)
      .from('invitations')
      .select('id, email, organization_id, accepted_at, declined_at, revoked_at')
      .eq('id', invitationId)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.organization_id !== organization.id) {
      return NextResponse.json(
        { error: 'Access denied. This invitation belongs to a different organization.' },
        { status: 403 }
      );
    }

    if (invitation.accepted_at || invitation.declined_at || invitation.revoked_at) {
      return NextResponse.json(
        { error: 'Invitation is already finalized and cannot be revoked.' },
        { status: 400 }
      );
    }

    const { error: revokeError } = await (supabaseServer as any)
      .from('invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invitationId)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null);

    if (revokeError) {
      return NextResponse.json({ error: 'Failed to delete invitation' }, { status: 500 });
    }

    try {
      await (supabaseServer as any).rpc('log_security_event', {
        organization_id_param: organization.id,
        actor_user_id_param: userId,
        action_param: 'invite.deleted',
        resource_type_param: 'invitation',
        resource_id_param: invitation.id,
        user_agent_param: request.headers.get('user-agent'),
        metadata_param: {
          invited_email: invitation.email,
        },
      });
    } catch (auditError) {
      console.warn('Failed to write invite-deleted audit event:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Invitation to ${invitation.email} has been deleted`,
    });
  } catch (error) {
    console.error('Error in team DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
