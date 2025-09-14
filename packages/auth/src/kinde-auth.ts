import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { DatabaseQueries } from '@tradetool/database';
import { SupabaseClient } from '@supabase/supabase-js';
import type { User, Organization } from '@tradetool/types';

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
        kindeOrgId: kindeOrg.orgCode,
        storageUsed: 0,
        storageLimit: 5368709120, // 5GB default
      });
    }

    return org;
  }

  async hasOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
    const { getOrganization, getPermissions } = getKindeServerSession();
    const kindeOrg = await getOrganization();
    const permissions = await getPermissions();

    if (!kindeOrg) return false;

    const org = await this.db.getOrganizationBySlug(kindeOrg.orgCode);
    
    if (!org || org.id !== organizationId) return false;

    return permissions?.permissions?.includes('read:organization') || 
           permissions?.permissions?.includes('admin:organization') ||
           true; // Default access for now - implement proper RBAC later
  }

  async getOrganizationRole(userId: string, organizationId: string): Promise<string | null> {
    const { getPermissions } = getKindeServerSession();
    const permissions = await getPermissions();

    if (permissions?.permissions?.includes('admin:organization')) {
      return 'admin';
    }
    
    if (permissions?.permissions?.includes('write:organization')) {
      return 'editor';
    }
    
    if (permissions?.permissions?.includes('read:organization')) {
      return 'viewer';
    }

    return 'member'; // Default role
  }
}