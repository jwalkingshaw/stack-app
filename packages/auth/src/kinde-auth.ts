import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { DatabaseQueries } from '@tradetool/database';
import { SupabaseClient } from '@supabase/supabase-js';
import type { User, Organization, OrganizationMember, UserPermissions } from '@tradetool/types';

export class AuthService {
  constructor(private db: DatabaseQueries) {}

  async getCurrentUser(): Promise<User | null> {
    const { getUser } = getKindeServerSession();
    const kindeUser = await getUser();

    if (!kindeUser) return null;

    return {
      id: kindeUser.id,
      email: kindeUser.email || '',
      name: kindeUser.given_name && kindeUser.family_name
        ? `${kindeUser.given_name} ${kindeUser.family_name}`
        : kindeUser.email || '',
      picture: kindeUser.picture || undefined,
    };
  }

  async getCurrentOrganization(slug: string): Promise<Organization | null> {
    const { getOrganization } = getKindeServerSession();
    const kindeOrg = await getOrganization();

    if (!kindeOrg) return null;

    let org = await this.db.getOrganizationBySlug(slug);

    if (!org && kindeOrg.orgCode === slug) {
      org = await this.db.createOrganization({
        name: kindeOrg.orgName || slug,
        slug: slug,
        type: 'business',
        kindeOrgId: kindeOrg.orgCode,
        storageUsed: 0,
        storageLimit: 5368709120, // 5GB default
      });
    }

    return org;
  }

  /**
   * Check if user has any access to organization (database-driven)
   */
  async hasOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
    return await this.db.hasOrgAccess(userId, organizationId);
  }

  /**
   * Get user's organization membership details
   */
  async getOrganizationMember(userId: string, organizationId: string): Promise<OrganizationMember | null> {
    return await this.db.getOrganizationMember(userId, organizationId);
  }

  /**
   * Get user's role in organization
   */
  async getOrganizationRole(userId: string, organizationId: string): Promise<string | null> {
    return await this.db.getUserRole(userId, organizationId);
  }

  /**
   * Get all user permissions for an organization
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<UserPermissions> {
    return await this.db.getUserPermissions(userId, organizationId);
  }

  /**
   * Check if user can download assets
   */
  async canDownloadAssets(userId: string, organizationId: string): Promise<boolean> {
    return await this.db.canDownloadAssets(userId, organizationId);
  }

  /**
   * Check if user can edit products
   */
  async canEditProducts(userId: string, organizationId: string): Promise<boolean> {
    return await this.db.canEditProducts(userId, organizationId);
  }

  /**
   * Check if user can manage team members
   */
  async canManageTeam(userId: string, organizationId: string): Promise<boolean> {
    return await this.db.canManageTeam(userId, organizationId);
  }

  /**
   * Generic scoped authorization check for DAM/PIM/team actions.
   */
  async hasScopedPermission(params: {
    userId: string;
    organizationId: string;
    permissionKey: string;
    marketId?: string | null;
    channelId?: string | null;
    collectionId?: string | null;
  }): Promise<boolean> {
    return await this.db.hasScopedPermission(params);
  }

  /**
   * Check if user is admin or owner
   */
  async isAdminOrOwner(userId: string, organizationId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, organizationId);
    return permissions.is_admin || permissions.is_owner;
  }
}
