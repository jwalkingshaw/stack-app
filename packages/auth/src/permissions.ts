import type { UserRole, UserPermissions } from '@tradetool/types';

/**
 * Permission constants
 */
export enum Permission {
  DOWNLOAD_ASSETS = 'download_assets',
  EDIT_PRODUCTS = 'edit_products',
  MANAGE_TEAM = 'manage_team',
  MANAGE_SETTINGS = 'manage_settings',
  VIEW_ONLY = 'view_only',
}

/**
 * Role hierarchy (higher number = more permissions)
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  viewer: 2,
  partner: 1,
};

/**
 * Get default permissions for a role
 */
export function getRolePermissions(role: UserRole): {
  canDownloadAssets: boolean;
  canEditProducts: boolean;
  canManageTeam: boolean;
} {
  switch (role) {
    case 'owner':
      return {
        canDownloadAssets: true,
        canEditProducts: true,
        canManageTeam: true,
      };
    case 'admin':
      return {
        canDownloadAssets: true,
        canEditProducts: true,
        canManageTeam: true,
      };
    case 'editor':
      return {
        canDownloadAssets: true,
        canEditProducts: true,
        canManageTeam: false,
      };
    case 'viewer':
      return {
        canDownloadAssets: true,
        canEditProducts: false,
        canManageTeam: false,
      };
    case 'partner':
      return {
        canDownloadAssets: true, // Partners can download per requirements
        canEditProducts: false,
        canManageTeam: false,
      };
    default:
      return {
        canDownloadAssets: false,
        canEditProducts: false,
        canManageTeam: false,
      };
  }
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  permissions: UserPermissions,
  permission: Permission
): boolean {
  if (!permissions.role) return false;

  switch (permission) {
    case Permission.DOWNLOAD_ASSETS:
      return permissions.can_download_assets;
    case Permission.EDIT_PRODUCTS:
      return permissions.can_edit_products;
    case Permission.MANAGE_TEAM:
      return permissions.can_manage_team;
    case Permission.MANAGE_SETTINGS:
      return permissions.is_owner || permissions.is_admin;
    case Permission.VIEW_ONLY:
      return true; // All authenticated users can view
    default:
      return false;
  }
}

/**
 * Check if a role has at least the same level as required role
 */
export function hasRoleLevel(
  userRole: UserRole | null,
  requiredRole: UserRole
): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if user is admin or owner
 */
export function isAdminOrOwner(permissions: UserPermissions): boolean {
  return permissions.is_admin || permissions.is_owner;
}

/**
 * Check if user can perform an action on a resource
 */
export function canPerformAction(
  permissions: UserPermissions,
  action: 'view' | 'edit' | 'delete' | 'download' | 'manage_team'
): boolean {
  if (!permissions.role) return false;

  switch (action) {
    case 'view':
      return true; // All members can view
    case 'edit':
      return permissions.can_edit_products;
    case 'delete':
      return permissions.is_admin || permissions.is_owner;
    case 'download':
      return permissions.can_download_assets;
    case 'manage_team':
      return permissions.can_manage_team;
    default:
      return false;
  }
}

/**
 * Get human-readable role name
 */
export function getRoleName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
    partner: 'Partner',
  };
  return roleNames[role] || role;
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    owner: 'Full access to everything',
    admin: 'Manage team members and all content',
    editor: 'Create and edit products and assets',
    viewer: 'View and download content only',
    partner: 'Limited view access to shared content',
  };
  return descriptions[role] || '';
}

/**
 * Validate role transition (can user A change user B's role?)
 */
export function canChangeRole(
  changer: UserPermissions,
  targetCurrentRole: UserRole,
  targetNewRole: UserRole
): { allowed: boolean; reason?: string } {
  // Only admins and owners can change roles
  if (!isAdminOrOwner(changer)) {
    return { allowed: false, reason: 'Insufficient permissions to change roles' };
  }

  // Owners cannot be demoted (unless by themselves)
  if (targetCurrentRole === 'owner' && targetNewRole !== 'owner') {
    return {
      allowed: false,
      reason: 'Cannot demote organization owner',
    };
  }

  // Admins cannot promote to owner
  if (!changer.is_owner && targetNewRole === 'owner') {
    return { allowed: false, reason: 'Only owners can promote to owner role' };
  }

  // Admins cannot demote other admins (only owners can)
  if (
    !changer.is_owner &&
    targetCurrentRole === 'admin' &&
    targetNewRole !== 'admin'
  ) {
    return { allowed: false, reason: 'Only owners can change admin roles' };
  }

  return { allowed: true };
}
