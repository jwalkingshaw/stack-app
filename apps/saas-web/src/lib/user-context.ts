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

type MemberOrgRow = {
  organization_id: string;
  role: string;
  status: string;
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
    organization_type?: string | null;
  }> | null;
};

type BrandRelationshipRow = {
  brand_organization_id: string;
  access_level: string;
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
  }> | null;
};

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
    const ownedOrganizations: Array<{ id: string; name: string; slug: string; kindeOrgId: string; organizationType?: string }> = [];
    if (kindeOrg?.orgCode) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug, kinde_org_id, organization_type')
        .eq('kinde_org_id', kindeOrg.orgCode)
        .single();

      if (org) {
        ownedOrganizations.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          kindeOrgId: org.kinde_org_id,
          organizationType: org.organization_type,
        });
      }
    }

    // Get member organizations (include organization_type for partner detection)
    const { data: memberOrgs } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        role,
        status,
        organizations (
          id,
          name,
          slug,
          organization_type
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active');

    const memberOrgRows = Array.isArray(memberOrgs) ? (memberOrgs as MemberOrgRow[]) : [];

    const memberOrganizations = memberOrgRows.map((m) => ({
      orgId: m.organization_id,
      orgName: m.organizations?.[0]?.name ?? "",
      orgSlug: m.organizations?.[0]?.slug ?? "",
      role: m.role,
      status: m.status
    }));

    // Resolve partner brand access via brand_partner_relationships.
    // A user gains brand access through any partner-type org they belong to.
    const partnerOrgIds = [
      ...memberOrgRows
        .filter((m) => m.organizations?.[0]?.organization_type === 'partner')
        .map((m) => m.organization_id),
      ...ownedOrganizations
        .filter((o) => o.organizationType === 'partner')
        .map((o) => o.id),
    ];

    let partnerAccess: UserContext['partnerAccess'] = [];
    if (partnerOrgIds.length > 0) {
      const { data: brandRelationships } = await supabase
        .from('brand_partner_relationships')
        .select(`
          brand_organization_id,
          access_level,
          organizations!brand_partner_relationships_brand_organization_id_fkey (
            id,
            name,
            slug
          )
        `)
        .in('partner_organization_id', partnerOrgIds)
        .eq('status', 'active');

      // Map DB access_level ('view' | 'edit') to internal hierarchy
      const toAccessLevel = (dbLevel: string) =>
        dbLevel === 'edit' ? 'collaborate' : 'view';

      const brandRelationshipRows = Array.isArray(brandRelationships)
        ? (brandRelationships as BrandRelationshipRow[])
        : [];
      partnerAccess = brandRelationshipRows.map((r) => ({
        orgId: r.brand_organization_id,
        orgName: r.organizations?.[0]?.name ?? "",
        orgSlug: r.organizations?.[0]?.slug ?? "",
        accessLevel: toAccessLevel(r.access_level),
      }));
    }

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
