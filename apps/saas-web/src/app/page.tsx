import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth-server'
import { createServerClient } from '@tradetool/database'

// Server component with smart routing logic
export default async function SmartRouter() {
  console.log('🔍 Smart routing: Checking user authentication');
  
  // Check if user is authenticated
  const user = await requireUser()
  
  if (!user?.id) {
    console.log('❌ No authenticated user found, redirecting to login');
    redirect('/login')
  }

  console.log('✅ User authenticated, checking workspaces for:', user.email);

  try {
    const supabase = createServerClient()

    // Get all organizations user is a member of
    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        role,
        last_accessed_at,
        organization:organizations (
          id,
          name,
          slug
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active')

    if (error) {
      console.error('❌ Database error fetching user workspaces:', error)
      console.error('❌ Full error details:', JSON.stringify(error, null, 2))
      redirect('/onboarding')
    }

    console.log('🔍 Database query results:', { 
      membershipsCount: memberships?.length || 0, 
      memberships: memberships?.map(m => ({
        slug: m.organization.slug,
        name: m.organization.name,
        lastAccessed: m.last_accessed_at
      }))
    });

    if (!memberships || memberships.length === 0) {
      console.log('🆕 No workspaces found, redirecting to onboarding')
      console.log('🔍 Debug info - User ID:', user.id, 'Email:', user.email)
      redirect('/onboarding')
    }

    // Find most recently accessed workspace (smart routing)
    const lastUsedWorkspace = memberships
      .filter(m => m.last_accessed_at)
      .sort((a, b) => new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime())[0]
      || memberships[0] // Fallback to first workspace

    const targetSlug = lastUsedWorkspace.organization.slug
    
    console.log('🚀 Smart redirect to workspace:', {
      slug: targetSlug,
      name: lastUsedWorkspace.organization.name,
      totalWorkspaces: memberships.length,
      lastAccessed: lastUsedWorkspace.last_accessed_at
    })

    redirect(`/${targetSlug}`)

  } catch (error) {
    // Don't catch redirect errors - they're normal Next.js behavior
    if (error?.message?.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    console.error('❌ Smart routing error:', error)
    redirect('/onboarding')
  }

  // This component only handles routing - should never render UI
  return null
}