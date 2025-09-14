'use client'

import { ReactNode, useState } from 'react'
import { UnifiedHeader } from '@tradetool/ui'
import { SaaSSidebar, Organization } from './SaaSSidebar'

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
    storageUsed?: number
    storageLimit?: number
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(!sidebarDefaultOpen)
  
  // Force sidebar to show for saas-web, unless fullScreen mode
  const shouldShowSidebar = showSidebar && authContext.isAuthenticated && !fullScreen
  
  const getContentClasses = () => {
    let classes = "w-full"
    return `${classes} ${contentClassName}`
  }
  
  // Render without sidebar - full screen with grey border consistency
  if (!shouldShowSidebar) {
    return (
      <div className="min-h-screen bg-sidebar overflow-hidden">
        <div className="h-screen w-full p-0 sm:p-2">
          <div className="h-full w-full bg-background sm:rounded sm:border border-sidebar-border overflow-hidden">
            <div className="h-full overflow-y-auto">
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
            storageUsed={sidebarProps.storageUsed}
            storageLimit={sidebarProps.storageLimit}
            defaultCollapsed={!sidebarDefaultOpen}
            onCollapseChange={setSidebarCollapsed}
          />
        </div>

        {/* Content area with grey border frame */}
        <div className="flex-1 min-w-0 p-0 sm:p-2 h-screen">
          <div className="h-full w-full bg-background sm:rounded sm:border border-sidebar-border overflow-hidden">
            <div className="h-full overflow-y-auto">
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