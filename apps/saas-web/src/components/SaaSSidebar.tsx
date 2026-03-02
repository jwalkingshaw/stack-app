'use client'

import React, { ReactNode, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Files,
  Database,
  Package,
  ChevronDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@tradetool/ui'
import { Button } from './ui/button'
import type { WorkspaceSummary } from '@/hooks/useWorkspaces'
import { WorkspaceRail } from './WorkspaceRail'
import {
  buildTenantPathForScope,
  extractPartnerScopeFromPath,
  resolvePartnerSelectedBrandSlug,
} from '@/lib/tenant-view-scope'

export interface Organization {
  id: string
  name: string
  slug: string
  organizationType?: 'brand' | 'partner'
  partnerCategory?: 'retailer' | 'distributor' | 'wholesaler' | null
  plan?: 'free' | 'pro' | 'enterprise'
}

export interface SidebarUser {
  id: string
  email: string
  firstName?: string
  lastName?: string
  picture?: string
}

export interface SaaSSidebarProps {
  organization?: Organization | null
  currentPath?: string
  orgSlug?: string
  workspaces?: WorkspaceSummary[]
  onNavigate?: (url: string) => void
  storageUsed?: number
  storageLimit?: number
  onCollapseChange?: (collapsed: boolean) => void
  defaultCollapsed?: boolean
  user?: SidebarUser | null
  onLogout?: () => void
  children?: ReactNode
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function SaaSSidebar({
  organization,
  currentPath = '',
  orgSlug,
  workspaces,
  onNavigate,
  storageUsed = 0,
  storageLimit = 0,
  onCollapseChange,
  defaultCollapsed = false,
  user,
  onLogout,
  children,
}: SaaSSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const searchParams = useSearchParams()
  const fallbackBrandSlug = (searchParams.get('brand') || '').trim().toLowerCase()

  const currentWorkspaceSlug = orgSlug ?? organization?.slug ?? ''

  const organizationName = organization?.name ?? ''
  const organizationSlug = organization?.slug ?? ''
  const showWorkspaceRail = organization?.organizationType === 'partner'
  const currentWorkspaceMembership = workspaces?.find(
    (workspace) => workspace.slug === currentWorkspaceSlug
  )
  const canManageMembers =
    currentWorkspaceMembership?.role === 'owner' || currentWorkspaceMembership?.role === 'admin'
  const userFirstName = user?.firstName ?? ''
  const userLastName = user?.lastName ?? ''
  const userEmail = user?.email ?? ''
  const pathScope = extractPartnerScopeFromPath(currentPath, currentWorkspaceSlug)
  const selectedBrandSlug = resolvePartnerSelectedBrandSlug({
    pathname: currentPath,
    tenantSlug: currentWorkspaceSlug,
    fallbackBrandSlug,
    organizationType: organization?.organizationType,
  })
  const activeScope = pathScope || selectedBrandSlug

  const expandSidebar = () => {
    if (!isCollapsed) return
    setIsCollapsed(false)
    onCollapseChange?.(false)
  }

  const handleNavigation = (url: string) => {
    if (onNavigate) {
      onNavigate(url)
    } else {
      window.location.href = url
    }
  }

  const buildPath = useCallback((suffix = '') => {
    if (!currentWorkspaceSlug) return '/'
    if (organization?.organizationType !== 'partner') {
      return suffix ? `/${currentWorkspaceSlug}${suffix}` : `/${currentWorkspaceSlug}`
    }
    return buildTenantPathForScope({
      tenantSlug: currentWorkspaceSlug,
      scope: activeScope,
      suffix,
    })
  }, [activeScope, currentWorkspaceSlug, organization?.organizationType])

  const isActive = (path: string) => {
    if (!path || path === '#') return false
    const normalizedPath = path.split('?')[0]
    return currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`)
  }

  const storagePercentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0

  const userFullName = useMemo(() => {
    const parts = [userFirstName, userLastName].filter(Boolean)
    return parts.join(' ')
  }, [userFirstName, userLastName])

  const workspaceInitial = useMemo(() => {
    const basis = organizationName || organizationSlug || userFullName || userEmail || '?'
    return basis.charAt(0).toUpperCase()
  }, [organizationName, organizationSlug, userEmail, userFullName])

  const navGroups = useMemo(() => {
    const groups = [
      {
        label: 'Primary',
        items: [
          {
            label: 'Dashboard',
            path: buildPath(),
            icon: BarChart3,
          },
        ],
      },
      {
        label: 'Library',
        items: [
          {
            label: 'Assets',
            path: buildPath('/assets'),
            icon: Files,
          },
          {
            label: 'Products',
            path: buildPath('/products'),
            icon: Package,
          },
        ],
      },
    ]

    return groups.filter((group) => group.items.length > 0)
  }, [buildPath])

  const handleLogout = () => {
    onLogout?.()
  }

  return (
    <div
      onMouseEnter={() => {
        expandSidebar()
      }}
      onFocusCapture={expandSidebar}
      className="bg-[#f5f5f5] h-full flex"
    >
      {showWorkspaceRail ? (
        <WorkspaceRail
          currentWorkspaceSlug={currentWorkspaceSlug}
          currentWorkspaceName={organizationName}
          currentPath={currentPath}
          initialWorkspaces={workspaces}
        />
      ) : null}

      <div
        className={`h-full flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-56 opacity-100'
        }`}
      >
        <div className="flex items-center justify-between px-3 h-14">
          <div className="flex flex-1 items-center gap-2">
            <DropdownMenu
              open={isWorkspaceMenuOpen}
      onOpenChange={(open) => {
        setIsWorkspaceMenuOpen(open)
      }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Open account menu"
                  className="workspace-menu-trigger flex flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-foreground hover:bg-muted/60 focus:outline-none focus:!shadow-none focus-visible:outline-none focus-visible:!shadow-none"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {organizationName || 'Workspace'}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-150" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                alignOffset={-28}
                side="bottom"
                onMouseEnter={() => setIsWorkspaceMenuOpen(true)}
                onMouseLeave={() => {
                  setIsWorkspaceMenuOpen(false)
                }}
                className="w-72 rounded-md border border-border/60 bg-white shadow-none"
              >
                <DropdownMenuLabel className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
                    {workspaceInitial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {organizationName || 'Workspace'}
                    </div>
                    {user && (
                      <div className="text-xs text-muted-foreground truncate">
                        Signed in as {userFullName || userEmail}
                      </div>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => handleNavigation(`/${currentWorkspaceSlug}/settings`)}
                  className="cursor-pointer"
                >
                  Settings
                </DropdownMenuItem>
                {canManageMembers ? (
                  <DropdownMenuItem
                    onSelect={() => handleNavigation(buildPath('/settings/team'))}
                    className="cursor-pointer"
                  >
                    Invite &amp; manage members
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  disabled={!onLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="h-8 w-8 ml-2" aria-hidden="true" />
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.path)
                    return (
                      <Link
                        key={item.label}
                        href={item.path}
                        prefetch={false}
                        aria-label={item.label}
                        className={`flex items-center rounded-md transition-colors ${
                          active
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        } gap-2 px-3 py-2 text-sm font-normal`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {storageLimit > 0 && (
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
    </div>
  )
}
