import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { cache } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UserContext {
  kindeUserId: string;
  email: string;
  ownedOrganizations: Array<{
    id: string;
    name: string;
    slug: string;
    kindeOrgId: string;
  }>;
  memberOrganizations: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string;
    role: string;
    status: string;
  }>;
  partnerAccess: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string;
    accessLevel: string;
    expiresAt?: string;
  }>;
  allAccessibleOrgIds: string[];
  lastUpdated: Date;
}

/**
 * Get comprehensive user context with caching
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  try {
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) return null;

    // Check cache first
    const { data: cachedContext } = await supabase
      .from('user_context_cache')
      .select('context_data, expires_at')
      .eq('kinde_user_id', user.id)
      .single();

    if (cachedContext && new Date(cachedContext.expires_at) > new Date()) {
      return cachedContext.context_data as UserContext;
    }

    // Build fresh context
    const kindeOrg = await getOrganization();
    
    // Get owned organizations (via Kinde)
    const ownedOrganizations = [];
    if (kindeOrg?.orgCode) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug, kinde_org_id')
        .eq('kinde_org_id', kindeOrg.orgCode)
        .single();
      
      if (org) {
        ownedOrganizations.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          kindeOrgId: org.kinde_org_id
        });
      }
    }

    // Get member organizations
    const { data: memberOrgs } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        role,
        status,
        organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active');

    const memberOrganizations = (memberOrgs || []).map((m: any) => ({
      orgId: m.organization_id,
      orgName: m.organizations.name,
      orgSlug: m.organizations.slug,
      role: m.role,
      status: m.status
    }));

    // Get partner access
    const { data: partnerOrgs } = await supabase
      .from('partner_access')
      .select(`
        organization_id,
        access_level,
        expires_at,
        organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()');

    const partnerAccess = (partnerOrgs || []).map((p: any) => ({
      orgId: p.organization_id,
      orgName: p.organizations.name,
      orgSlug: p.organizations.slug,
      accessLevel: p.access_level,
      expiresAt: p.expires_at
    }));

    // Combine all accessible org IDs
    const allAccessibleOrgIds = [
      ...ownedOrganizations.map(o => o.id),
      ...memberOrganizations.map(m => m.orgId),
      ...partnerAccess.map(p => p.orgId)
    ];

    const context: UserContext = {
      kindeUserId: user.id,
      email: user.email!,
      ownedOrganizations,
      memberOrganizations,
      partnerAccess,
      allAccessibleOrgIds,
      lastUpdated: new Date()
    };

    // Cache the context for 5 minutes
    await supabase
      .from('user_context_cache')
      .upsert({
        kinde_user_id: user.id,
        context_data: context,
        last_updated: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      });

    return context;
  } catch (error) {
    console.error('Error getting user context:', error);
    return null;
  }
});

/**
 * Check if user has access to a specific organization
 */
export async function hasOrganizationAccess(
  organizationSlug: string,
  requiredAccessLevel?: 'view' | 'download' | 'collaborate' | 'manage' | 'admin'
): Promise<{
  hasAccess: boolean;
  accessType: 'owner' | 'member' | 'partner' | null;
  accessLevel?: string;
  organizationId?: string;
}> {
  const context = await getUserContext();
  
  if (!context) {
    return { hasAccess: false, accessType: null };
  }

  // Check if user owns the organization
  const ownedOrg = context.ownedOrganizations.find(o => o.slug === organizationSlug);
  if (ownedOrg) {
    return {
      hasAccess: true,
      accessType: 'owner',
      accessLevel: 'admin',
      organizationId: ownedOrg.id
    };
  }

  // Check member access
  const memberOrg = context.memberOrganizations.find(m => m.orgSlug === organizationSlug);
  if (memberOrg) {
    let hasRequiredLevel = false;
    
    if (!requiredAccessLevel) {
      hasRequiredLevel = true;
    } else if (memberOrg.role === 'admin' || memberOrg.role === 'owner') {
      hasRequiredLevel = true;
    } else if (memberOrg.role === 'member') {
      // Members can view, download, and collaborate, but not manage/admin
      hasRequiredLevel = ['view', 'download', 'collaborate'].includes(requiredAccessLevel);
    }
    
    return {
      hasAccess: hasRequiredLevel,
      accessType: 'member',
      accessLevel: memberOrg.role,
      organizationId: memberOrg.orgId
    };
  }

  // Check partner access
  const partnerOrg = context.partnerAccess.find(p => p.orgSlug === organizationSlug);
  if (partnerOrg) {
    const accessLevels = ['view', 'download', 'collaborate', 'manage'];
    const userLevel = accessLevels.indexOf(partnerOrg.accessLevel);
    const requiredLevel = accessLevels.indexOf(requiredAccessLevel || 'view');
    
    const hasRequiredLevel = userLevel >= requiredLevel;
    
    return {
      hasAccess: hasRequiredLevel,
      accessType: 'partner',
      accessLevel: partnerOrg.accessLevel,
      organizationId: partnerOrg.orgId
    };
  }

  return { hasAccess: false, accessType: null };
}

/**
 * Invalidate user context cache (call when permissions change)
 */
export async function invalidateUserContext(kindeUserId: string) {
  await supabase
    .from('user_context_cache')
    .delete()
    .eq('kinde_user_id', kindeUserId);
}

/**
 * Set user context for RLS (call before database operations)
 */
export async function setDatabaseUserContext(kindeUserId: string, orgCode?: string) {
  // Set the user context for RLS policies
  await supabase.rpc('set_rls_setting', {
    setting_name: 'app.current_user_id',
    new_value: kindeUserId,
    is_local: true
  });

  if (orgCode) {
    await supabase.rpc('set_rls_setting', {
      setting_name: 'app.current_org_code', 
      new_value: orgCode,
      is_local: true
    });
  }
}
