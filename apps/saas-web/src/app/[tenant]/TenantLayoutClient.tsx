'use client'

import { AppLayoutShell } from '@/components/AppLayoutShell'
import { usePathname } from 'next/navigation'

interface SafeUser {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  picture: string | null
}

interface SafeOrganization {
  id: string
  name: string
  slug: string
  storageUsed: number
  storageLimit: number
}

interface TenantLayoutClientProps {
  children: React.ReactNode
  user: SafeUser | null
  organization: SafeOrganization | null
  tenantSlug: string
}

export default function TenantLayoutClient({ 
  children, 
  user, 
  organization, 
  tenantSlug 
}: TenantLayoutClientProps) {
  const pathname = usePathname()
  
  // Check if this is a product detail page for full-screen mode
  const isProductDetailPage = pathname.match(/^\/[^\/]+\/products\/[^\/]+$/) !== null
  
  // Data is pre-authenticated and ready - render immediately with no loading
  return (
    <AppLayoutShell 
      authContext={{ 
        isAuthenticated: true, // Already verified server-side
        user: user ? {
          id: user.id,
          email: user.email,
          firstName: user.given_name,
          lastName: user.family_name,
          picture: user.picture
        } : null
      }}
      showSidebar={true}
      fullScreen={isProductDetailPage}
      sidebarDefaultOpen={true}
      headerProps={{
        orgSlug: tenantSlug,
        user: user ? {
          id: user.id,
          email: user.email,
          firstName: user.given_name,
          lastName: user.family_name,
          picture: user.picture
        } : null,
        onLogout: () => {
          window.location.href = '/api/auth/logout'
        }
      }}
      sidebarProps={{
        organization: organization ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          plan: 'pro' // You can add this to your data model
        } : null,
        orgSlug: tenantSlug,
        currentPath: pathname,
        storageUsed: organization?.storageUsed || 0,
        storageLimit: organization?.storageLimit || 0,
      }}
    >
      {children}
    </AppLayoutShell>
  )
}