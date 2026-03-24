'use client'

import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import NextImage from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  BarChart3,
  Files,
  Package,
  Megaphone,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@tradetool/ui'
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
  logoUrl?: string | null
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
  onCollapseChange?: (collapsed: boolean) => void
  defaultCollapsed?: boolean
  user?: SidebarUser | null
  onLogout?: () => void
  children?: ReactNode
}

export function SaaSSidebar({
  organization,
  currentPath = '',
  orgSlug,
  workspaces,
  onNavigate,
  onCollapseChange,
  defaultCollapsed = false,
  user,
  onLogout,
  children,
}: SaaSSidebarProps) {
  const t = useTranslations("Shell.Sidebar")
  const helpCenterUrl =
    process.env.NEXT_PUBLIC_HELP_CENTER_URL?.trim() || 'https://help.stackcess.com'
  const currentWorkspaceSlug = orgSlug ?? organization?.slug ?? ''
  const sidebarStorageKey = useMemo(
    () => `saas-sidebar-collapsed:${organization?.organizationType ?? 'brand'}:${currentWorkspaceSlug || 'unknown'}`,
    [currentWorkspaceSlug, organization?.organizationType]
  )
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const searchParams = useSearchParams()
  const fallbackBrandSlug = (searchParams.get('brand') || '').trim().toLowerCase()

  const organizationName = organization?.name ?? ''
  const organizationSlug = organization?.slug ?? ''
  const showWorkspaceRail = organization?.organizationType === 'partner'
  const [workspaceLogoFailed, setWorkspaceLogoFailed] = useState(false)
  const [workspaceLogoBySlug, setWorkspaceLogoBySlug] = useState<Record<string, string | null>>({})
  const currentWorkspaceMembership = workspaces?.find(
    (workspace) => workspace.slug === currentWorkspaceSlug
  )
  useEffect(() => {
    let isActive = true
    const loadWorkspaceLogos = async () => {
      try {
        const response = await fetch(`/api/me/workspaces?ts=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const data = await response.json()
        const nextLogos: Record<string, string | null> = {}
        if (Array.isArray(data?.workspaces)) {
          for (const workspace of data.workspaces) {
            const slug =
              typeof workspace?.slug === 'string' ? workspace.slug.trim().toLowerCase() : ''
            if (!slug) continue
            const logoUrl =
              typeof workspace?.logoUrl === 'string' && workspace.logoUrl.trim().length > 0
                ? workspace.logoUrl.trim()
                : null
            nextLogos[slug] = logoUrl
          }
        }
        if (isActive) {
          setWorkspaceLogoBySlug(nextLogos)
        }
      } catch {
        // best-effort refresh for logo state
      }
    }
    void loadWorkspaceLogos()
    return () => {
      isActive = false
    }
  }, [currentWorkspaceSlug])
  const currentWorkspaceLogoUrl =
    workspaceLogoBySlug[currentWorkspaceSlug.toLowerCase()] ??
    currentWorkspaceMembership?.logoUrl ??
    organization?.logoUrl ??
    null
  const showWorkspaceLogo = Boolean(currentWorkspaceLogoUrl && !workspaceLogoFailed)
  useEffect(() => {
    setWorkspaceLogoFailed(false)
  }, [currentWorkspaceLogoUrl])
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(sidebarStorageKey)
      if (saved === '1' || saved === '0') {
        const nextValue = saved === '1'
        setIsCollapsed(nextValue)
        onCollapseChange?.(nextValue)
        return
      }
    } catch {
      // no-op: localStorage is best-effort
    }
    setIsCollapsed(defaultCollapsed)
    onCollapseChange?.(defaultCollapsed)
  }, [defaultCollapsed, onCollapseChange, sidebarStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(sidebarStorageKey, isCollapsed ? '1' : '0')
    } catch {
      // no-op: localStorage is best-effort
    }
  }, [isCollapsed, sidebarStorageKey])

  const updateCollapsedState = (collapsed: boolean) => {
    setIsCollapsed(collapsed)
    onCollapseChange?.(collapsed)
  }

  const toggleCollapsed = () => {
    updateCollapsedState(!isCollapsed)
  }

  const handleExpandFromLogo = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isCollapsed) return
    updateCollapsedState(false)
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
        label: '',
        items: [
          {
            label: t("dashboard"),
            path: buildPath(),
            icon: BarChart3,
          },
        ],
      },
      {
        label: t("catalog"),
        items: [
          {
            label: t("assets"),
            path: buildPath('/assets'),
            icon: Files,
          },
          {
            label: t("products"),
            path: buildPath('/products'),
            icon: Package,
          },
          {
            label: t("updates"),
            path: buildPath('/updates'),
            icon: Megaphone,
          },
        ],
      },
    ]

    return groups.filter((group) => group.items.length > 0)
  }, [buildPath, t])

  const handleLogout = () => {
    onLogout?.()
  }

  return (
    <div className="bg-[#f5f5f5] h-full flex">
      {showWorkspaceRail ? (
        <WorkspaceRail
          currentWorkspaceSlug={currentWorkspaceSlug}
          currentWorkspaceName={organizationName}
          currentWorkspaceLogoUrl={currentWorkspaceLogoUrl}
          currentOrganizationType={organization?.organizationType}
          currentPath={currentPath}
          initialWorkspaces={workspaces}
        />
      ) : null}

      <div
        className={`h-full flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          isCollapsed ? 'w-16 opacity-100' : 'w-48 opacity-100'
        }`}
      >
        <div className={`${isCollapsed ? 'py-3 px-2' : 'px-3 h-14'}`}>
          <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between gap-2 h-full'}`}>
            {isCollapsed ? (
              <button
                type="button"
                onClick={handleExpandFromLogo}
                aria-label={t("expandSidebar")}
                title={t("expandSidebar")}
                className="group flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted/60 focus:outline-none focus:!shadow-none focus-visible:outline-none focus-visible:!shadow-none"
              >
                <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                  {showWorkspaceLogo ? (
                    <NextImage
                      src={currentWorkspaceLogoUrl!}
                      alt={`${organizationName || 'Workspace'} logo`}
                      className="h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                      width={24}
                      height={24}
                      unoptimized
                      onError={() => setWorkspaceLogoFailed(true)}
                    />
                  ) : (
                    <span className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
                      {workspaceInitial}
                    </span>
                  )}
                  <PanelLeftOpen
                    className="pointer-events-none absolute h-4 w-4 text-primary-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden="true"
                  />
                </div>
              </button>
            ) : (
              <div className="flex-1">
                <DropdownMenu
                  open={isWorkspaceMenuOpen}
                  onOpenChange={(open) => {
                    setIsWorkspaceMenuOpen(open)
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("openAccountMenu")}
                      className="workspace-menu-trigger flex flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-foreground hover:bg-muted/60 focus:outline-none focus:!shadow-none focus-visible:outline-none focus-visible:!shadow-none"
                    >
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                        {showWorkspaceLogo ? (
                          <NextImage
                            src={currentWorkspaceLogoUrl!}
                            alt={`${organizationName || 'Workspace'} logo`}
                            className="h-full w-full object-cover"
                            width={24}
                            height={24}
                            unoptimized
                            onError={() => setWorkspaceLogoFailed(true)}
                          />
                        ) : (
                          workspaceInitial
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-normal text-foreground truncate">
                          {organizationName || t("workspace")}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-150" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    alignOffset={8}
                    side="bottom"
                    onMouseEnter={() => setIsWorkspaceMenuOpen(true)}
                    onMouseLeave={() => {
                      setIsWorkspaceMenuOpen(false)
                    }}
                    className="w-72 rounded-md border border-border/60 bg-white shadow-none"
                  >
                    {user ? (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {t("signedInAs", { user: userFullName || userEmail })}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => handleNavigation(`/${currentWorkspaceSlug}/settings`)}
                      className="cursor-pointer"
                    >
                      {t("settings")}
                    </DropdownMenuItem>
                    {canManageMembers ? (
                      <DropdownMenuItem
                        onSelect={() => handleNavigation(buildPath('/settings/team'))}
                        className="cursor-pointer"
                      >
                        {t("inviteManageMembers")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => window.open(helpCenterUrl, '_blank', 'noopener,noreferrer')}
                      className="cursor-pointer"
                    >
                      {t("helpCenter")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={handleLogout}
                      disabled={!onLogout}
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      {t("logOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {!isCollapsed ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label={t("collapseSidebar")}
                title={t("collapseSidebar")}
              >
                <PanelLeftClose className="h-4 w-4 mx-auto" />
              </button>
            ) : null}
          </div>
        </div>

        <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'py-2 px-2' : 'py-3 px-2'}`}>
          <div className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                {group.label && !isCollapsed ? (
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {group.label}
                  </div>
                ) : null}
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
                        title={isCollapsed ? item.label : undefined}
                        className={`flex items-center rounded-md transition-colors ${
                          active
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        } ${
                          isCollapsed
                            ? 'justify-center h-10 px-0 py-0'
                            : 'gap-2 px-3 py-2 text-sm font-normal'
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {!isCollapsed ? (
                          <span className="flex-1 truncate">{item.label}</span>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {children}
      </div>
    </div>
  )
}
