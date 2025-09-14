'use client'

import React, { ReactNode, useState } from 'react'
import Link from 'next/link'
import { 
  Menu, 
  BarChart3, 
  Files, 
  Folder, 
  Settings, 
  Star,
  Clock,
  Share2,
  Trash2,
  Database,
  Plus,
  ChevronRight,
  Users,
  TrendingUp,
  Activity,
  Archive,
  Package,
  Map
} from 'lucide-react'
import { Button } from './ui/button'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

export interface Organization {
  id: string
  name: string
  slug: string
  plan?: 'free' | 'pro' | 'enterprise'
}

export interface SaaSSidebarProps {
  organization?: Organization | null
  currentPath?: string
  orgSlug?: string
  onNavigate?: (url: string) => void
  storageUsed?: number
  storageLimit?: number
  onCollapseChange?: (collapsed: boolean) => void
  defaultCollapsed?: boolean
  children?: ReactNode
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function SaaSSidebar({
  organization,
  currentPath = "",
  orgSlug,
  onNavigate,
  storageUsed = 0,
  storageLimit = 0,
  onCollapseChange,
  defaultCollapsed = false,
  children
}: SaaSSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  
  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    onCollapseChange?.(newCollapsed)
  }
  
  const handleNavigation = (url: string) => {
    if (onNavigate) {
      onNavigate(url)
    } else {
      window.location.href = url
    }
  }
  
  const isActive = (path: string) => {
    return currentPath === path || currentPath?.startsWith(path + '/')
  }
  
  const storagePercentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0

  return (
    <div className={`bg-sidebar h-full flex flex-col transition-all duration-300 ease-out ${
      isCollapsed ? 'w-16' : 'w-48'
    }`}>
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex-1 min-w-0">
          {organization && !isCollapsed && (
            <div className="text-sm font-medium text-foreground truncate">
              {organization.name}
            </div>
          )}
          {organization && isCollapsed && (
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded flex items-center justify-center text-sm font-medium">
              {organization.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors ml-2"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* Main Navigation */}
        <div className="space-y-0.5">
          <Link 
            href={`/${orgSlug}`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}`) && currentPath === `/${orgSlug}`
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <BarChart3 className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">Dashboard</span>}
          </Link>
          
          <Link 
            href={`/${orgSlug}/assets`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}/assets`)
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Files className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">Assets</span>}
          </Link>
          
          <Link 
            href={`/${orgSlug}/products`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}/products`)
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Package className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">Products</span>}
          </Link>
          
          <Link 
            href={`/${orgSlug}/roadmap`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}/roadmap`)
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Map className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">RoadMap</span>}
          </Link>
          
          <Link 
            href={`/${orgSlug}/folders`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}/folders`)
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Folder className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">Folders</span>}
          </Link>
          
          <Link 
            href={`/${orgSlug}/settings`}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-normal rounded-md transition-colors ${
              isActive(`/${orgSlug}/settings`)
                ? 'bg-muted text-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="flex-1">Settings</span>}
          </Link>
        </div>

      </nav>

      {/* Minimal Storage Stats */}
      {!isCollapsed && storageLimit > 0 && (
        <div className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Storage</span>
            </div>
            
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{formatFileSize(storageUsed)}</span>
              <span>{formatFileSize(storageLimit)}</span>
            </div>
            
            <div className="w-full bg-muted rounded-sm h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-sm transition-all duration-300"
                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
              />
            </div>
            
            {storagePercentage > 90 && (
              <Button variant="outline" size="sm" className="w-full mt-2 text-xs">
                Upgrade
              </Button>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  )
}