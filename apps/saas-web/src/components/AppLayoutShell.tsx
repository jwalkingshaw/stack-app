'use client'

import { ReactNode, useState } from 'react'
import { AppHeader } from './AppHeader'
import { SaaSSidebar, Organization, SidebarUser } from './SaaSSidebar'

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
      lastAccessed?: string
      unreadCount?: number
    }>
    storageUsed?: number
    storageLimit?: number
    user?: SidebarUser | null
    onLogout?: () => void
    folders?: Array<{
      id: string
      name: string
      parentId: string | null
      path: string
    }>
  }
  showSidebar?: boolean
  sidebarDefaultOpen?: boolean
  contentClassName?: string
  fullScreen?: boolean
}

export function AppLayoutShell({
  children,
  authContext,
  headerProps = {},
  sidebarProps = {},
  showSidebar = true,
  sidebarDefaultOpen = true,
  contentClassName = "",
  fullScreen = false
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

  // Force sidebar to show for saas-web, unless fullScreen mode
  const shouldShowSidebar = showSidebar && authContext.isAuthenticated && !fullScreen
  
  const getContentClasses = () => {
    let classes = "w-full"
    return `${classes} ${contentClassName}`
  }
  
  // Render without sidebar - full screen with grey border consistency
  if (!shouldShowSidebar) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] overflow-hidden">
        <div className="h-screen w-full p-2">
          <div className="h-full w-full bg-background rounded border border-muted/20 shadow-soft overflow-hidden">
            <div className="h-full overflow-y-auto bg-white">
              <AppHeader />
              {children}
            </div>
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
            storageUsed={sidebarProps.storageUsed}
            storageLimit={sidebarProps.storageLimit}
            defaultCollapsed={!sidebarDefaultOpen}
            onCollapseChange={setSidebarCollapsed}
            user={resolvedSidebarUser}
            onLogout={resolvedLogout}
          />
        </div>

        {/* Content area with grey border frame */}
        <div className="flex-1 min-w-0 p-2 h-screen bg-[#f5f5f5]">
          <div className="h-full w-full bg-background rounded border border-muted/20 shadow-soft overflow-hidden">
            <div className="h-full overflow-y-auto bg-white">
              <AppHeader />
              <div className={getContentClasses()}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
