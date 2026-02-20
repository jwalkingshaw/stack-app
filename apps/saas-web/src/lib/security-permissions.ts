import { AuthService, ScopedPermission } from "@tradetool/auth";

type PermissionContext = {
  authService: AuthService;
  userId: string;
  organizationId: string;
};

export async function canManageContainerSharing({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  const [legacyCanManageTeam, canManageSharing] = await Promise.all([
    authService.canManageTeam(userId, organizationId),
    authService.hasScopedPermission({
      userId,
      organizationId,
      permissionKey: ScopedPermission.ContainerShareManage,
    }),
  ]);

  return legacyCanManageTeam || canManageSharing;
}

export async function canSendInvite({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  const [legacyCanManageTeam, canSendInvitePermission] = await Promise.all([
    authService.canManageTeam(userId, organizationId),
    authService.hasScopedPermission({
      userId,
      organizationId,
      permissionKey: ScopedPermission.InviteSend,
    }),
  ]);

  return legacyCanManageTeam || canSendInvitePermission;
}

export async function canRevokeInvite({
  authService,
  userId,
  organizationId,
}: PermissionContext): Promise<boolean> {
  const [legacyCanManageTeam, canRevokeInvitePermission] = await Promise.all([
    authService.canManageTeam(userId, organizationId),
    authService.hasScopedPermission({
      userId,
      organizationId,
      permissionKey: ScopedPermission.InviteRevoke,
    }),
  ]);

  return legacyCanManageTeam || canRevokeInvitePermission;
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
