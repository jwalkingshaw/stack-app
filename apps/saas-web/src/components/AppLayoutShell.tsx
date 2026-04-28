'use client'

import { ReactNode } from 'react'
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
  contentClassName = ""
}: AppLayoutShellProps) {
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
      <div className="min-h-screen overflow-hidden bg-[hsl(var(--app-shell-canvas))]">
        <div className="h-screen w-full p-1.5">
          <div className="h-full w-full overflow-hidden rounded-[22px] bg-[hsl(var(--app-shell-surface))] shadow-soft">
            <div className="relative h-full overflow-y-auto bg-white isolate">
              <AppHeader
                tenantSlug={sidebarProps.orgSlug ?? headerProps.orgSlug}
                organizationName={sidebarProps.organization?.name}
                organizationType={sidebarProps.organization?.organizationType}
                workspaces={sidebarProps.workspaces}
              />
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render with compact Slack-like sidebar and persistent top navigation.
  return (
    <div className="min-h-screen overflow-hidden bg-[hsl(var(--app-shell-canvas))]">
      <div className="h-screen w-full p-1.5">
        <div className="flex h-full max-w-full overflow-hidden rounded-[22px] bg-[hsl(var(--app-shell-surface))] shadow-soft">
        <div className="sticky top-0 h-screen flex-shrink-0">
          <SaaSSidebar
            organization={sidebarProps.organization}
            orgSlug={sidebarProps.orgSlug}
            currentPath={sidebarProps.currentPath}
            workspaces={sidebarProps.workspaces}
            user={resolvedSidebarUser}
            onLogout={resolvedLogout}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="h-full w-full overflow-hidden rounded-l-[20px] bg-white">
            <div className="relative h-full overflow-y-auto bg-white isolate">
              <AppHeader
                tenantSlug={sidebarProps.orgSlug ?? headerProps.orgSlug}
                organizationName={sidebarProps.organization?.name}
                organizationType={sidebarProps.organization?.organizationType}
                workspaces={sidebarProps.workspaces}
              />
              <div className={getContentClasses()}>
                {children}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
