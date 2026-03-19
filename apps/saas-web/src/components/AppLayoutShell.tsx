'use client'

import { ReactNode, useState } from 'react'
import { AppHeader } from './AppHeader'
import { SaaSSidebar, Organization, SidebarUser } from './SaaSSidebar'
import { HeaderToolbarProvider } from './header-toolbar-context'

export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  picture?: string
}

export interface AppLayoutShellProps {
  children: ReactNode
  authContext: {
    isAuthenticated: boolean
    user?: User | null
  }
  headerProps?: {
    orgSlug?: string
    user?: User | null
    onLogout?: () => void
    children?: ReactNode
  }
  sidebarProps?: {
    organization?: Organization | null
    orgSlug?: string
    currentPath?: string
    workspaces?: Array<{
      id: string
      name: string
      slug: string
      role: string
      organizationType?: 'brand' | 'partner'
      partnerCategory?: 'retailer' | 'distributor' | 'wholesaler' | null
      logoUrl?: string | null
      lastAccessed?: string
      unreadCount?: number
    }>
    user?: SidebarUser | null
    onLogout?: () => void
  }
  showSidebar?: boolean
  sidebarDefaultOpen?: boolean
  contentClassName?: string
}

export function AppLayoutShell({
  children,
  authContext,
  headerProps = {},
  sidebarProps = {},
  showSidebar = true,
  sidebarDefaultOpen = true,
  contentClassName = ""
}: AppLayoutShellProps) {
  const [, setSidebarCollapsed] = useState(!sidebarDefaultOpen)

  const resolvedSidebarUser: SidebarUser | null =
    sidebarProps.user ??
    (headerProps.user
      ? {
          id: headerProps.user.id,
          email: headerProps.user.email,
          firstName: headerProps.user.firstName,
          lastName: headerProps.user.lastName,
          picture: headerProps.user.picture,
        }
      : authContext.user
      ? {
          id: authContext.user.id,
          email: authContext.user.email,
          firstName: authContext.user.firstName,
          lastName: authContext.user.lastName,
          picture: authContext.user.picture,
        }
      : null)

  const resolvedLogout = sidebarProps.onLogout ?? headerProps.onLogout

  // Keep global navigation available whenever sidebar rendering is enabled.
  const shouldShowSidebar = showSidebar && authContext.isAuthenticated
  
  const getContentClasses = () => {
    const classes = "w-full"
    return `${classes} ${contentClassName}`
  }
  
  // Render without sidebar - full screen with grey border consistency
  if (!shouldShowSidebar) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] overflow-hidden">
        <div className="h-screen w-full p-3">
          <div className="h-full w-full bg-background rounded shadow-soft overflow-hidden">
            <HeaderToolbarProvider>
              <div className="relative h-full overflow-y-auto bg-white isolate">
                <AppHeader />
                {children}
              </div>
            </HeaderToolbarProvider>
          </div>
        </div>
      </div>
    )
  }

  // Render with minimal sidebar - no unified header
  return (
    <div className="min-h-screen bg-sidebar overflow-hidden">
      <div className="flex h-screen max-w-full">
        {/* Sticky Sidebar */}
        <div className="sticky top-0 h-screen flex-shrink-0">
          <SaaSSidebar
            organization={sidebarProps.organization}
            orgSlug={sidebarProps.orgSlug}
            currentPath={sidebarProps.currentPath}
            workspaces={sidebarProps.workspaces}
            defaultCollapsed={!sidebarDefaultOpen}
            onCollapseChange={setSidebarCollapsed}
            user={resolvedSidebarUser}
            onLogout={resolvedLogout}
          />
        </div>

        {/* Content area with grey border frame */}
        <div className="flex-1 min-w-0 p-3 h-screen bg-[#f5f5f5]">
          <div className="h-full w-full bg-background rounded shadow-soft overflow-hidden">
            <HeaderToolbarProvider>
              <div className="relative h-full overflow-y-auto bg-white isolate">
                <AppHeader />
                <div className={getContentClasses()}>
                  {children}
                </div>
              </div>
            </HeaderToolbarProvider>
          </div>
        </div>
      </div>
    </div>
  )
}
