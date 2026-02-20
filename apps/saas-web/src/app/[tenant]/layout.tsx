import { redirect } from 'next/navigation'
import { getSafeUserData, isAuthenticated, requireUser } from '@/lib/auth-server'
import { createServerClient, DatabaseQueries } from '@tradetool/database'
import { evaluateTenantAccessDecision } from '@/lib/tenant-access-decision'
import { getActiveWorkspaceMemberships } from '@/lib/workspace-notifications'
import TenantLayoutClient from './TenantLayoutClient'

interface TenantLayoutProps {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  const authenticated = await isAuthenticated()
  if (!authenticated) {
    redirect('/api/auth/login')
  }

  const user = await requireUser()
  if (!user?.id) {
    redirect('/unauthorized')
  }

  try {
    const supabase = createServerClient()
    const db = new DatabaseQueries(supabase)

    const organization = await db.getOrganizationBySlug(tenantSlug)
    if (!organization) {
      redirect('/unauthorized')
    }

    const directWorkspaces = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includePartnerBrandAccess: false, includeEmailLookup: false }
    )
    const accessibleWorkspaces = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    )
    const hasDirectAccess = directWorkspaces.some(
      (workspace) => workspace.organization.id === organization.id
    )

    const accessDecision = evaluateTenantAccessDecision({
      hasMembership: hasDirectAccess,
    })

    if (!accessDecision.allow) {
      redirect('/unauthorized')
    }

    const effectiveWorkspaces = accessibleWorkspaces

    try {
      await (supabase as any).rpc('update_workspace_access', {
        user_id: user.id,
        workspace_id: organization.id,
      })
    } catch {
      // non-blocking analytics update
    }

    const userData = await getSafeUserData()

    const workspaceIds = effectiveWorkspaces.map((workspace) => workspace.organization.id)
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const unreadCountByWorkspace = new Map<string, number>()

    await Promise.all(
      workspaceIds.map(async (workspaceId) => {
        const [{ count: recentAssetCount }, { count: recentProductCount }] = await Promise.all([
          supabase
            .from('dam_assets')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', workspaceId)
            .gte('created_at', recentSince),
          supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', workspaceId)
            .gte('created_at', recentSince),
        ])

        unreadCountByWorkspace.set(
          workspaceId,
          (recentAssetCount ?? 0) + (recentProductCount ?? 0)
        )
      })
    )

    const workspaces = effectiveWorkspaces.map((workspace) => ({
      id: workspace.organization.id,
      name: workspace.organization.name,
      slug: workspace.organization.slug,
      role: workspace.role,
      organizationType: workspace.organization.organizationType,
      partnerCategory: workspace.organization.partnerCategory,
      lastAccessed: workspace.lastAccessedAt ?? undefined,
      unreadCount: unreadCountByWorkspace.get(workspace.organization.id) ?? 0,
    }))

    const safeUserData = userData as {
      id: string
      email: string
      given_name: string | null
      family_name: string | null
      picture: string | null
    } | null

    return (
      <TenantLayoutClient
        user={safeUserData}
        organization={{
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          type: (organization.organizationType || organization.type || 'brand') as 'brand' | 'partner',
          partnerCategory: organization.partnerCategory ?? null,
          storageUsed: organization.storageUsed,
          storageLimit: organization.storageLimit,
        }}
        tenantSlug={tenantSlug}
        workspaces={workspaces}
      >
        {children}
      </TenantLayoutClient>
    )
  } catch {
    redirect('/unauthorized')
  }
}
