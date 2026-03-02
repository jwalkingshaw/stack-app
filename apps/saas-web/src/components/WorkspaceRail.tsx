'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bell, LayoutGrid, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaces, WorkspaceSummary } from '@/hooks/useWorkspaces'
import {
  buildTenantPathForScope,
  extractPartnerScopeFromPath,
  resolvePartnerSelectedBrandSlug,
  splitTenantPathForScope,
} from '@/lib/tenant-view-scope'

interface WorkspaceRailProps {
  currentWorkspaceSlug: string
  currentWorkspaceName?: string
  currentPath?: string
  initialWorkspaces?: WorkspaceSummary[]
  className?: string
}

function getWorkspaceInitial(workspace: WorkspaceSummary): string {
  const source = workspace.name || workspace.slug || '?'
  return source.charAt(0).toUpperCase()
}

function getWorkspaceUnreadCount(workspace: WorkspaceSummary): number {
  const value = (workspace as WorkspaceSummary & { unreadCount?: number }).unreadCount
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.floor(value))
}

export function WorkspaceRail({
  currentWorkspaceSlug,
  currentWorkspaceName,
  currentPath,
  initialWorkspaces,
  className,
}: WorkspaceRailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fallbackBrandSlug = (searchParams.get('brand') || '').trim().toLowerCase()
  const { sortedWorkspaces } = useWorkspaces({
    currentWorkspaceSlug,
    initialWorkspaces,
  })

  const workspaceEntries = useMemo(() => {
    const bySlug = new Map<string, WorkspaceSummary>()
    for (const workspace of sortedWorkspaces) {
      bySlug.set(workspace.slug, workspace)
    }

    if (currentWorkspaceSlug && !bySlug.has(currentWorkspaceSlug)) {
      bySlug.set(currentWorkspaceSlug, {
        id: currentWorkspaceSlug,
        slug: currentWorkspaceSlug,
        name: currentWorkspaceName || currentWorkspaceSlug,
        role: 'member',
      })
    }

    return Array.from(bySlug.values())
  }, [currentWorkspaceName, currentWorkspaceSlug, sortedWorkspaces])

  const totalUnreadCount = useMemo(() => {
    return workspaceEntries.reduce((sum, workspace) => sum + getWorkspaceUnreadCount(workspace), 0)
  }, [workspaceEntries])
  const currentWorkspace = workspaceEntries.find(
    (workspace) => workspace.slug === currentWorkspaceSlug
  )
  const pathScope = extractPartnerScopeFromPath(currentPath, currentWorkspaceSlug)
  const selectedBrandSlug = resolvePartnerSelectedBrandSlug({
    pathname: currentPath,
    tenantSlug: currentWorkspaceSlug,
    fallbackBrandSlug,
    organizationType: currentWorkspace?.organizationType,
  })
  const activeScope = pathScope || selectedBrandSlug
  const isPartnerContext = currentWorkspace?.organizationType === 'partner'
  const partnerAllViewPath = `/${currentWorkspaceSlug}/view/all`
  const overviewButtonLabel = isPartnerContext ? 'View all' : 'Home'

  const isAllBrandsActive = Boolean(
    currentPath?.startsWith('/home') ||
      currentPath?.startsWith('/all-brands') ||
      (isPartnerContext &&
        (pathScope === 'all' ||
          currentPath === partnerAllViewPath ||
          currentPath?.startsWith(`${partnerAllViewPath}/`)))
  )
  const isHomeContext = Boolean(
    currentPath?.startsWith('/home') ||
      currentPath?.startsWith('/all-brands') ||
      (isPartnerContext &&
        (pathScope === 'all' ||
          currentPath === partnerAllViewPath ||
          currentPath?.startsWith(`${partnerAllViewPath}/`)))
  )
  const isTenantScopedContext = Boolean(
    currentPath?.startsWith(`/${currentWorkspaceSlug}`)
  )
  const isNotificationsActive = Boolean(currentPath?.startsWith('/notifications'))
  const { suffix } = splitTenantPathForScope(currentPath, currentWorkspaceSlug)
  const sectionSuffix = (() => {
    if (!suffix) return ''
    if (suffix.startsWith('/assets')) return '/assets'
    if (suffix.startsWith('/products')) return '/products'
    if (suffix.startsWith('/folders')) return '/folders'
    return ''
  })()

  return (
    <aside
      className={cn(
        'h-full w-16 border-r border-muted/30 bg-[#ebebeb] flex flex-col items-center py-3',
        className
      )}
      aria-label="Workspace switcher"
    >
      <div className="flex w-full flex-col items-center gap-2">
        <button
          type="button"
          title={overviewButtonLabel}
          onClick={() => {
            if (isPartnerContext) {
              router.push(partnerAllViewPath)
              return
            }
            router.push('/home')
          }}
          className={cn(
            'relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold transition-all',
            isAllBrandsActive
              ? 'rail-view-active'
              : 'bg-white text-foreground hover:bg-muted'
          )}
          aria-current={isAllBrandsActive ? 'page' : undefined}
        >
          <LayoutGrid className="h-5 w-5" />
        </button>

        <div className="h-px w-8 bg-border" />

        {workspaceEntries.map((workspace) => {
          const isBrandViewActive =
            isPartnerContext &&
            workspace.organizationType === 'brand' &&
            activeScope &&
            activeScope === workspace.slug.toLowerCase()
          const isCurrentWorkspaceActive =
            isTenantScopedContext &&
            workspace.slug === currentWorkspaceSlug &&
            !(isPartnerContext && Boolean(activeScope) && workspace.organizationType === 'partner')
          const isActive = isBrandViewActive || isCurrentWorkspaceActive
          const unreadCount = getWorkspaceUnreadCount(workspace)

          return (
            <button
              key={workspace.slug}
              type="button"
              title={`${workspace.name}${unreadCount > 0 ? ` (${unreadCount} new)` : ''}`}
              onClick={() => {
                if (isPartnerContext && workspace.organizationType === 'brand') {
                  router.push(
                    buildTenantPathForScope({
                      tenantSlug: currentWorkspaceSlug,
                      scope: workspace.slug.toLowerCase(),
                      suffix: sectionSuffix,
                    })
                  )
                  return
                }
                if (isHomeContext && workspace.organizationType === 'brand') {
                  router.push(
                    buildTenantPathForScope({
                      tenantSlug: currentWorkspaceSlug,
                      scope: workspace.slug.toLowerCase(),
                    })
                  )
                  return
                }
                router.push(`/${workspace.slug}`)
              }}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold transition-all',
                isActive
                  ? 'rail-view-active'
                  : 'bg-white text-foreground hover:bg-muted'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {getWorkspaceInitial(workspace)}
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 h-px w-8 bg-border" />

      <button
        type="button"
        title="Create workspace"
        onClick={() => router.push('/onboarding?create=1')}
        className="mt-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
      </button>

      <div className="mt-auto">
        <button
          type="button"
          title="Notifications"
          onClick={() => router.push('/notifications')}
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted',
            isNotificationsActive ? 'rail-view-active' : 'text-muted-foreground hover:text-foreground'
          )}
          aria-current={isNotificationsActive ? 'page' : undefined}
        >
          <Bell className="h-4 w-4" />
          {totalUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
