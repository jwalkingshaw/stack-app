import { redirect } from 'next/navigation'
import { getSafeUserData, getSafeOrganizationData, isAuthenticated, requireOrganization, requireUser } from '@/lib/auth-server'
import { createServerClient, DatabaseQueries } from "@tradetool/database"
import TenantLayoutClient from './TenantLayoutClient'

interface TenantLayoutProps {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant


  // Server-side auth check - fast and cached
  const authenticated = await isAuthenticated()
  
  if (!authenticated) {
    redirect('/api/auth/login')
  }


  // Get user's Kinde organization
  const kindeOrg = await requireOrganization()
  const user = await requireUser()

  if (!user?.id) {
    redirect('/unauthorized')
  }

  // Check if user has access to this specific tenant
  try {
    const supabase = createServerClient()
    const db = new DatabaseQueries(supabase)
    
    // Get organization by slug
    const organization = await db.getOrganizationBySlug(tenantSlug)
    
    if (!organization) {
      console.log('❌ Organization not found for slug:', tenantSlug)
      redirect('/unauthorized')
    }

    // HYBRID APPROACH: Try Kinde first, fallback to database verification
    if (kindeOrg?.orgCode) {
      // ✅ Normal Kinde flow (most common case)
      console.log('✅ Using Kinde session verification for org:', kindeOrg.orgCode)
      
      if (kindeOrg.orgCode !== organization.kindeOrgId) {
        console.log('❌ Kinde org mismatch:', { 
          sessionOrg: kindeOrg.orgCode, 
          dbOrg: organization.kindeOrgId 
        })
        redirect('/unauthorized')
      }
    } else {
      // 🔄 Fallback: Direct database verification (edge case after creation)
      console.log('⚠️ No Kinde org context, using database verification for user:', user.id)
      
      // Check if user is a member of this organization
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role, status')
        .eq('organization_id', organization.id)
        .eq('kinde_user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!membership) {
        console.log('❌ User not found in organization members:', { 
          userId: user.id, 
          orgId: organization.id 
        })
        redirect('/unauthorized')
      }

      console.log('✅ Database verification successful - user has access:', {
        userId: user.id,
        orgId: organization.id,
        role: membership.role
      })
    }


    // Update last accessed timestamp for smart routing
    try {
      await supabase.rpc('update_workspace_access', {
        user_id: user.id,
        workspace_id: organization.id
      })
      console.log('✅ Updated workspace access timestamp for user:', user.id)
    } catch (updateError) {
      console.warn('⚠️ Failed to update workspace access timestamp:', updateError)
      // Don't fail the request for this
    }

    // Pre-fetch all required data server-side
    const [userData, organizationData] = await Promise.all([
      getSafeUserData(),
      getSafeOrganizationData()
    ])

    // All auth checks passed and data is ready - render immediately
    return (
      <TenantLayoutClient
        user={userData}
        organization={organizationData}
        tenantSlug={tenantSlug}
      >
        {children}
      </TenantLayoutClient>
    )
  } catch (error) {
    redirect('/unauthorized')
  }
}