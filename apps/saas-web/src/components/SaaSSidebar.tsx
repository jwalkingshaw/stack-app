'use client'

import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import NextImage from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  BarChart3,
  Files,
  Package,
  Send,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@stack-app/ui'
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
  user,
  onLogout,
  children,
}: SaaSSidebarProps) {
  const t = useTranslations("Shell.Sidebar")
  const helpCenterUrl =
    process.env.NEXT_PUBLIC_HELP_CENTER_URL?.trim() || 'https://help.stackcess.com'
  const currentWorkspaceSlug = orgSlug ?? organization?.slug ?? ''
  const searchParams = useSearchParams()
  const fallbackBrandSlug = (searchParams.get('brand') || '').trim().toLowerCase()
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [workspaceLogoFailed, setWorkspaceLogoFailed] = useState(false)
  const [workspaceLogoBySlug, setWorkspaceLogoBySlug] = useState<Record<string, string | null>>({})

  const organizationName = organization?.name ?? ''
  const organizationSlug = organization?.slug ?? ''
  const showWorkspaceRail = organization?.organizationType === 'partner'
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
  const userFullName = useMemo(() => {
    const parts = [user?.firstName ?? '', user?.lastName ?? ''].filter(Boolean)
    return parts.join(' ')
  }, [user?.firstName, user?.lastName])
  const pathScope = extractPartnerScopeFromPath(currentPath, currentWorkspaceSlug)
  const selectedBrandSlug = resolvePartnerSelectedBrandSlug({
    pathname: currentPath,
    tenantSlug: currentWorkspaceSlug,
    fallbackBrandSlug,
    organizationType: organization?.organizationType,
  })
  const activeScope = pathScope || selectedBrandSlug

  const handleNavigation = (url: string) => {
    if (onNavigate) {
      onNavigate(url)
    } else {
      window.location.href = url
    }
  }

  const buildPath = (suffix = '') => {
    if (!currentWorkspaceSlug) return '/'
    if (organization?.organizationType !== 'partner') {
      return suffix ? `/${currentWorkspaceSlug}${suffix}` : `/${currentWorkspaceSlug}`
    }
    return buildTenantPathForScope({
      tenantSlug: currentWorkspaceSlug,
      scope: activeScope,
      suffix,
    })
  }

  const isActive = (path: string) => {
    if (!path || path === '#') return false
    const normalizedPath = path.split('?')[0]
    if (normalizedPath === buildPath()) {
      return currentPath === normalizedPath || currentPath === `${normalizedPath}/`
    }
    return currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`)
  }

  const workspaceInitial = useMemo(() => {
    const basis = organizationName || organizationSlug || userFullName || user?.email || '?'
    return basis.charAt(0).toUpperCase()
  }, [organizationName, organizationSlug, user?.email, userFullName])

  const navItems = [
    {
      label: t("dashboard"),
      shortLabel: 'Home',
      path: buildPath(),
      icon: BarChart3,
    },
    {
      label: t("products"),
      shortLabel: t("products"),
      path: buildPath('/products'),
      icon: Package,
    },
    ...(organization?.organizationType === 'partner'
      ? []
      : [
          {
            label: t("syndication"),
            shortLabel: 'Sync',
            path: buildPath('/syndication'),
            icon: Send,
          },
        ]),
    {
      label: organization?.organizationType === 'partner' ? t("brandLibrary") : t("assets"),
      shortLabel: organization?.organizationType === 'partner' ? 'Library' : t("assets"),
      path: buildPath('/assets'),
      icon: Files,
    },
  ]

  return (
    <div className="flex h-full bg-transparent">
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

      <div className="flex h-full w-[82px] flex-col bg-transparent px-2 py-3">
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
              className="group flex w-full flex-col items-center rounded-2xl px-2 py-2 text-center text-foreground transition-colors hover:bg-white/50 focus:outline-none focus-visible:outline-none"
            >
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl bg-primary text-xs font-semibold text-primary-foreground shadow-sm">
                {showWorkspaceLogo ? (
                  <NextImage
                    src={currentWorkspaceLogoUrl!}
                    alt={`${organizationName || 'Workspace'} logo`}
                    className="h-full w-full object-cover"
                    width={36}
                    height={36}
                    unoptimized
                    onError={() => setWorkspaceLogoFailed(true)}
                  />
                ) : (
                  workspaceInitial
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={10}
            className="w-72 rounded-md border border-border/60 bg-white shadow-none"
          >
            {user ? (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("signedInAs", { user: userFullName || user.email })}
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
              onSelect={() => onLogout?.()}
              disabled={!onLogout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              {t("logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <nav className="mt-2 flex-1">
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.label}
                  href={item.path}
                  prefetch={false}
                  aria-label={item.label}
                  title={item.label}
                  className={`group flex w-full flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 text-center transition-all ${
                    active
                      ? 'bg-[hsl(var(--app-shell-nav-active))] text-foreground shadow-none'
                      : 'text-muted-foreground hover:bg-white/50 hover:text-foreground'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-2xl ${
                    active ? 'bg-white/60' : 'bg-white/78'
                  }`}>
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  </div>
                  <span className="line-clamp-2 text-[10px] font-medium leading-3">
                    {item.shortLabel}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>

        {children}

      </div>
    </div>
  )
}
