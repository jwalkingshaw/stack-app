'use client'

import { AppLayoutShell } from '@/components/AppLayoutShell'
import { ToastContainer } from '@/components/ui/toast'
import { usePathname } from 'next/navigation'
import { MarketContextProvider } from '@/components/market-context'

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
  type: "brand" | "partner"
  partnerCategory: "retailer" | "distributor" | "wholesaler" | null
  storageUsed: number
  storageLimit: number
}

interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  role: string
  organizationType?: "brand" | "partner"
  partnerCategory?: "retailer" | "distributor" | "wholesaler" | null
  lastAccessed?: string
  unreadCount?: number
}

interface TenantLayoutClientProps {
  children: React.ReactNode
  user: SafeUser | null
  organization: SafeOrganization | null
  tenantSlug: string
  workspaces: WorkspaceSummary[]
}

export default function TenantLayoutClient({
  children,
  user,
  organization,
  tenantSlug,
  workspaces
}: TenantLayoutClientProps) {
  const pathname = usePathname()

  // Check if this is a product detail page or variant page for full-screen mode
  const isProductDetailPage =
    pathname.match(/^\/[^\/]+(?:\/view\/[^\/]+)?\/products\/[^\/]+(?:\/variants\/[^\/]+)?$/) !== null

  // Check if this is a settings page - settings has its own layout and sidebar
  const isSettingsPage = pathname.includes('/settings')

  // For settings pages, don't render AppLayoutShell at all - settings has its own layout
  if (isSettingsPage) {
    return (
      <>
        {children}
        <ToastContainer />
      </>
    )
  }

  // Data is pre-authenticated and ready - render immediately with no loading
  return (
    <MarketContextProvider tenantSlug={tenantSlug}>
      <AppLayoutShell
        authContext={{
          isAuthenticated: true, // Already verified server-side
          user: user ? {
            id: user.id,
            email: user.email,
            firstName: user.given_name || undefined,
            lastName: user.family_name || undefined,
            picture: user.picture || undefined
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
            firstName: user.given_name || undefined,
            lastName: user.family_name || undefined,
            picture: user.picture || undefined
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
            organizationType: organization.type,
            partnerCategory: organization.partnerCategory,
            plan: 'pro' // You can add this to your data model
          } : null,
          orgSlug: tenantSlug,
          currentPath: pathname,
          workspaces,
          storageUsed: organization?.storageUsed || 0,
          storageLimit: organization?.storageLimit || 0,
        }}
      >
        {children}
        <ToastContainer />
      </AppLayoutShell>
    </MarketContextProvider>
  )
}
