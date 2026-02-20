import { redirect } from 'next/navigation'
import { getCurrentOrganization, requireUser } from '@/lib/auth-server'
import { createServerClient } from '@tradetool/database'
import { getActiveWorkspaceMemberships } from '@/lib/workspace-notifications'

// Server component with smart routing logic
export default async function SmartRouter() {
  const user = await requireUser()

  if (!user?.id) {
    redirect('/login')
  }

  try {
    const supabase = createServerClient()
    const memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    )

    if (!memberships || memberships.length === 0) {
      const currentOrganization = await getCurrentOrganization()
      if (currentOrganization?.slug) {
        redirect(`/${currentOrganization.slug}`)
      }
      redirect('/onboarding')
    }

    const lastUsedWorkspace =
      memberships
        .filter((membership): membership is typeof membership & { lastAccessedAt: string } =>
          Boolean(membership.lastAccessedAt)
        )
        .sort(
          (a, b) =>
            new Date(b.lastAccessedAt).getTime() -
            new Date(a.lastAccessedAt).getTime()
        )[0] || memberships[0]

    if (!lastUsedWorkspace.organization.slug) {
      redirect('/onboarding')
    }

    const partnerMembership = memberships.find(
      (membership) => membership.organization.organizationType === 'partner'
    )
    if (partnerMembership?.organization?.slug) {
      redirect(`/${partnerMembership.organization.slug}/view/all`)
    }

    if (memberships.length > 1) {
      redirect('/home')
    }

    redirect(`/${lastUsedWorkspace.organization.slug}`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error
    }

    console.error('Smart routing error:', error)
    redirect('/onboarding')
  }

  return null
}
