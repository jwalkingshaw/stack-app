'use client'

import React, { ReactNode, ComponentType } from 'react'
import { Menu, Building2, Plus, Star, Clock, Share2, Trash2, Folder, BarChart3, Files, Settings } from 'lucide-react'
// Custom sidebar - no external dependencies
import { NavItem, Surface, quickAccessConfig } from '../../lib/nav.config'
import { AuthContext, getNavItemsForRegion, buildNavUrl, getActiveNavItem } from '../../lib/nav'

export interface Organization {
  id: string
  name: string
  slug: string
  plan?: 'free' | 'pro' | 'enterprise'
}

// Link component type for framework flexibility
type LinkComponentProps = {
  href: string
  children: ReactNode
  className?: string
}

export interface SidebarProps {
  surface: Surface
  navItems: NavItem[]
  authContext: AuthContext
  
  // Organization context
  organization?: Organization | null
  
  // Current state
  currentPath?: string
  orgSlug?: string
  
  // Navigation
  onNavigate?: (url: string) => void
  
  // Link component (Next.js Link, React Router Link, etc.)
  LinkComponent?: ComponentType<LinkComponentProps>
  
  // Folders (for app surface)
  folders?: Array<{
    id: string
    name: string
    parentId: string | null
    path: string
  }>
  
  // Storage stats (for app surface)
  storageUsed?: number
  storageLimit?: number
  
  // State sharing with header
  onCollapseChange?: (collapsed: boolean) => void
  defaultCollapsed?: boolean
  
  // Customization
  children?: ReactNode
  
  // Component injection for different apps
  ButtonComponent?: React.ComponentType<any>
  TooltipComponents?: {
    Tooltip: React.ComponentType<any>
    TooltipTrigger: React.ComponentType<any>
    TooltipContent: React.ComponentType<any>
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function SidebarShell({
  surface,
  navItems,
  authContext,
  organization,
  currentPath = "",
  orgSlug,
  onNavigate,
  folders = [],
  storageUsed = 0,
  storageLimit = 0,
  onCollapseChange,
  defaultCollapsed = false,
  children,
  ButtonComponent,
  TooltipComponents,
  LinkComponent = ({ href, children, className }) => <a href={href} className={className}>{children}</a>
}: SidebarProps) {
  // Custom sidebar state management
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const { isAuthenticated } = authContext
  
  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    if (onCollapseChange) {
      onCollapseChange(newCollapsed)
    }
  }
  
  // Get sidebar navigation items
  const sidebarNavItems = getNavItemsForRegion(navItems, surface, 'sidebar', authContext)
  const activeItem = getActiveNavItem(sidebarNavItems, currentPath)
  
  
  const handleNavigation = (url: string) => {
    if (onNavigate) {
      onNavigate(url)
    } else {
      window.location.href = url
    }
  }
  
  const isActive = (item: NavItem) => {
    return activeItem?.id === item.id || currentPath === buildNavUrl(item, orgSlug)
  }
  
  // Remove all unused component functions
  
  return (
    <div className={`bg-white border-r border-gray-200 h-screen flex flex-col transition-all duration-200 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Header with Organization */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && organization && (
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{organization.name}</p>
              <p className="text-xs text-gray-500">Workspace</p>
            </div>
          </div>
        )}
        
        {isCollapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white mx-auto">
            <Building2 className="h-4 w-4" />
          </div>
        )}
        
        <button
          onClick={toggleSidebar}
          className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* App Navigation */}
        {surface === 'app' && isAuthenticated && (
          <div className="px-3 mb-6">
            {!isCollapsed && (
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Application
              </div>
            )}
            <div className="space-y-1">
              <button 
                onClick={() => handleNavigation(`/${orgSlug}`)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === `/${orgSlug}` 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Dashboard</span>}
              </button>
              
              <button 
                onClick={() => handleNavigation(`/${orgSlug}/assets`)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === `/${orgSlug}/assets` 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Files className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Assets</span>}
              </button>
              
              <button 
                onClick={() => handleNavigation(`/${orgSlug}/folders`)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === `/${orgSlug}/folders` 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Folder className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Folders</span>}
              </button>
              
              <button 
                onClick={() => handleNavigation(`/${orgSlug}/settings`)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === `/${orgSlug}/settings` 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Settings</span>}
              </button>
            </div>
          </div>
        )}

        {/* Marketing Navigation */}
        {surface === 'marketing' && (
          <div className="px-3 mb-6">
            {!isCollapsed && (
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Content
              </div>
            )}
            <div className="space-y-1">
              <button 
                onClick={() => handleNavigation('/')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === '/' 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Stackcess IQ</span>}
              </button>
              
              <button 
                onClick={() => handleNavigation('/technology')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPath === '/technology' 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="ml-3">Technology</span>}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Storage Stats (expanded only) */}
      {!isCollapsed && surface === 'app' && storageLimit && (
        <div className="p-4 border-t border-gray-200">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Storage</span>
              <span className="text-gray-900 font-medium">
                {formatFileSize(storageUsed)} / {formatFileSize(storageLimit)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((storageUsed / storageLimit) * 100, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500">
              {((storageUsed / storageLimit) * 100).toFixed(1)}% used
            </div>
          </div>
        </div>
      )}
    </div>
  )
}