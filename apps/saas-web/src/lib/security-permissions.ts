import { AuthService, ScopedPermission, type ScopedPermissionKey } from "@tradetool/auth";

type PermissionContext = {
  authService: AuthService;
  userId: string;
  organizationId: string;
};

async function hasLegacyTeamOrScopedPermission(params: {
  authService: AuthService;
  userId: string;
  organizationId: string;
  permissionKey: ScopedPermissionKey;
}): Promise<boolean> {
  const { authService, userId, organizationId, permissionKey } = params;

  // Short-circuit for owner/admin-style legacy access to avoid unnecessary scoped RPC calls.
  const legacyCanManageTeam = await authService.canManageTeam(userId, organizationId);
  if (legacyCanManageTeam) {
    return true;
  }

  return authService.hasScopedPermission({
    userId,
    organizationId,
    permissionKey,
  });
}

export async function canManageContainerSharing({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  return hasLegacyTeamOrScopedPermission({
    authService,
    userId,
    organizationId,
    permissionKey: ScopedPermission.ContainerShareManage,
  });
}

export async function canSendInvite({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  return hasLegacyTeamOrScopedPermission({
    authService,
    userId,
    organizationId,
    permissionKey: ScopedPermission.InviteSend,
  });
}

export async function canRevokeInvite({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  return hasLegacyTeamOrScopedPermission({
    authService,
    userId,
    organizationId,
    permissionKey: ScopedPermission.InviteRevoke,
  });
}

export async function canReadAudit({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  return authService.hasScopedPermission({
    userId,
    organizationId,
    permissionKey: ScopedPermission.AuditRead,
  });
}

export async function evaluateScopedPermission(params: {
  authService: AuthService;
  userId: string;
  organizationId: string;
  permissionKey: string;
  marketId?: string | null;
  channelId?: string | null;
  collectionId?: string | null;
}): Promise<boolean> {
  const {
    authService,
    userId,
    organizationId,
    permissionKey,
    marketId,
    channelId,
    collectionId,
  } = params;

  return authService.hasScopedPermission({
    userId,
    organizationId,
    permissionKey,
    marketId,
    channelId,
    collectionId,
  });
}
