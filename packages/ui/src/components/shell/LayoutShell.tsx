'use client'

import { ReactNode, useState } from 'react'
// Removed sidebar context imports - using custom sidebar now
import { UnifiedHeader, UnifiedHeaderProps } from '../unified-header'
import { SidebarShell, SidebarProps } from './Sidebar'
import { navigationConfig } from '../../lib/nav.config'
import { AuthContext, Surface } from '../../lib/nav'

// Custom sidebar handles its own state - no wrapper needed

export interface LayoutShellProps {
  surface: Surface
  authContext: AuthContext
  children: ReactNode
  
  // Header props
  headerProps?: Partial<Omit<UnifiedHeaderProps, 'variant' | 'user' | 'isAuthenticated'>>
  
  // Sidebar props  
  sidebarProps?: Partial<Omit<SidebarProps, 'surface' | 'navItems' | 'authContext'>>
  
  // Layout options
  showSidebar?: boolean
  sidebarDefaultOpen?: boolean
  
  // Content wrapper classes
  contentClassName?: string
  
  // Announcement bar (for marketing)
  announcementBar?: ReactNode
}

export function LayoutShell({
  surface,
  authContext,
  children,
  headerProps = {},
  sidebarProps = {},
  showSidebar = true,
  sidebarDefaultOpen = false,
  contentClassName = "",
  announcementBar
}: LayoutShellProps) {
  // Sidebar state management
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Determine if sidebar should be shown based on surface and auth
  const shouldShowSidebar = showSidebar && (
    surface === 'marketing' || 
    (surface === 'app' && authContext.isAuthenticated)
  )
  
  // Force sidebar to show for debugging
  const forcedSidebarShow = showSidebar
  
  
  
  // Wrapper background based on surface
  const getSurfaceWrapperClasses = () => {
    switch (surface) {
      case 'auth':
        return "min-h-screen bg-[#f5f5f5]"
      case 'marketing':
        return "min-h-screen bg-background"
      case 'app':
        return "min-h-screen bg-background"
      default:
        return "min-h-screen"
    }
  }
  
  // Get content padding based on surface and sidebar
  const getContentClasses = () => {
    let classes = "w-full flex flex-col"
    
    switch (surface) {
      case 'marketing':
        // Marketing has announcement bar + header + extra padding
        classes += " pt-[8rem]" // 3rem announcement + 67px header + extra spacing
        break
        
      case 'auth':
        // Auth flows are simple, just header
        classes += " pt-[67px]" // Align with unified header height
        break
        
      case 'app':
        // App has fixed header
        classes += " pt-[67px]" // Header height (67px to match unified header)
        break
    }
    
    return `${classes} ${contentClassName}`
  }
  
  // Render without sidebar
  if (!forcedSidebarShow) {
    return (
      <div className={getSurfaceWrapperClasses()}>
        {announcementBar}
        
        <UnifiedHeader
          variant={surface === 'marketing' ? 'marketing' : surface === 'auth' ? 'auth-flow' : 'saas-authenticated'}
          user={authContext.user}
          isAuthenticated={authContext.isAuthenticated}
          sidebarState={sidebarCollapsed ? 'collapsed' : 'expanded'}
          isMobile={false} // TODO: Add proper mobile detection
          onSidebarToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          {...headerProps}
        />
        
        <div className={getContentClasses()}>
          {children}
        </div>
      </div>
    )
  }
  
  // Render with sidebar
  return (
    <div className={getSurfaceWrapperClasses()}>
      {announcementBar}
      
      <div>
        <UnifiedHeader
          variant={surface === 'marketing' ? 'marketing' : surface === 'auth' ? 'auth-flow' : 'saas-authenticated'}
          user={authContext.user}
          isAuthenticated={authContext.isAuthenticated}
          sidebarState={sidebarCollapsed ? 'collapsed' : 'expanded'}
          isMobile={false} // TODO: Add proper mobile detection
          onSidebarToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          {...headerProps}
        />
        
        <div className="flex">
          <SidebarShell
            surface={surface}
            navItems={navigationConfig}
            authContext={authContext}
            defaultCollapsed={!sidebarDefaultOpen}
            onCollapseChange={setSidebarCollapsed}
            {...sidebarProps}
          />
          
          <div className={getContentClasses()}>
            <div className="relative flex-1">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Convenience components for specific surfaces
export function MarketingLayoutShell({
  authContext,
  children,
  announcementBar,
  ...props
}: Omit<LayoutShellProps, 'surface'>) {
  return (
    <LayoutShell
      surface="marketing"
      authContext={authContext}
      announcementBar={announcementBar}
      {...props}
    >
      {children}
    </LayoutShell>
  )
}

export function AuthLayoutShell({
  authContext,
  children,
  ...props
}: Omit<LayoutShellProps, 'surface' | 'showSidebar'>) {
  return (
    <LayoutShell
      surface="auth"
      authContext={authContext}
      showSidebar={false}
      {...props}
    >
      {children}
    </LayoutShell>
  )
}

export function AppLayoutShell({
  authContext,
  children,
  ...props
}: Omit<LayoutShellProps, 'surface'>) {
  return (
    <LayoutShell
      surface="app"
      authContext={authContext}
      {...props}
    >
      {children}
    </LayoutShell>
  )
}
