'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buildTenantPathForScope, extractPartnerScopeFromPath, resolvePartnerSelectedBrandSlug, splitTenantPathForScope } from '@/lib/tenant-view-scope'
import { BackLinkButton } from '@/components/ui/back-link-button'

import { GlobalSearchDialog } from '@/components/GlobalSearchDialog'

interface HeaderWorkspace {
  name: string
  slug: string
}

interface AppHeaderProps {
  tenantSlug?: string
  organizationName?: string
  organizationType?: 'brand' | 'partner'
  workspaces?: HeaderWorkspace[]
}

export function AppHeader({ tenantSlug, organizationName, organizationType, workspaces }: AppHeaderProps) {
  const t = useTranslations("Shell.Header")
  const headerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [partnerChannelName, setPartnerChannelName] = useState<string | null>(null)

  const normalizedTenantSlug = (tenantSlug || '').trim().toLowerCase()
  const fallbackBrandSlug = (searchParams.get('brand') || '').trim().toLowerCase()
  const urlMarketCode = (searchParams.get('market') || '').trim().toUpperCase()
  const productDetailMatch = pathname?.match(
    /^\/([^/]+)(?:\/view\/[^/]+)?\/products\/[^/]+(?:\/variants\/[^/]+)?$/
  )
  const scopeInfo = splitTenantPathForScope(pathname, productDetailMatch?.[1] || normalizedTenantSlug)
  const showBackButton = Boolean(productDetailMatch?.[1])
  const backHref = productDetailMatch?.[1]
    ? buildTenantPathForScope({
        tenantSlug: productDetailMatch[1],
        scope: scopeInfo.scope,
        suffix: '/products',
      })
    : '/'
  const pathScope = extractPartnerScopeFromPath(pathname, normalizedTenantSlug)
  const selectedBrandSlug = resolvePartnerSelectedBrandSlug({
    pathname,
    tenantSlug: normalizedTenantSlug,
    fallbackBrandSlug,
    organizationType,
  })
  const activeScope = pathScope || selectedBrandSlug
  const activeOrganizationName = useMemo(() => {
    const fallbackName = (organizationName || tenantSlug || 'Organization').trim()
    const normalizedScope = (activeScope || '').trim().toLowerCase()
    if (!normalizedScope || normalizedScope === 'all' || normalizedScope === normalizedTenantSlug) {
      return fallbackName
    }

    const scopedWorkspace = workspaces?.find(
      (workspace) => workspace.slug.trim().toLowerCase() === normalizedScope
    )
    return (scopedWorkspace?.name || fallbackName).trim()
  }, [activeScope, normalizedTenantSlug, organizationName, tenantSlug, workspaces])
  const searchPlaceholder = useMemo(
    () => `Search ${activeOrganizationName}`,
    [activeOrganizationName]
  )

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (!headerRef.current) return
      const height = headerRef.current.getBoundingClientRect().height
      if (!Number.isFinite(height) || height <= 0) return
      document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(height)}px`)
    }

    updateHeaderHeight()
    if (!headerRef.current || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(headerRef.current)
    window.addEventListener('resize', updateHeaderHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setIsGlobalSearchOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (organizationType !== 'partner' || !normalizedTenantSlug || !activeScope) {
      setPartnerChannelName(null)
      return
    }

    let active = true
    const fetchPartnerChannel = async () => {
      try {
        const response = await fetch(`/api/${normalizedTenantSlug}/view/${activeScope}/markets`, {
          cache: 'no-store',
        })
        if (!response.ok || !active) return
        const payload = await response.json()
        const markets: Array<{ code: string; channel: { name: string } | null }> =
          payload?.data?.markets ?? []
        if (markets.length === 0) {
          if (active) setPartnerChannelName(null)
          return
        }
        const selectedMarket = urlMarketCode
          ? markets.find((market) => market.code.toUpperCase() === urlMarketCode)
          : null
        const fallbackMarket = selectedMarket ?? markets[0]
        if (active) setPartnerChannelName(fallbackMarket.channel?.name ?? null)
      } catch {
        if (active) setPartnerChannelName(null)
      }
    }

    void fetchPartnerChannel()
    return () => {
      active = false
    }
  }, [activeScope, normalizedTenantSlug, organizationType, urlMarketCode])

  if (!normalizedTenantSlug) {
    return null
  }

  return (
    <>
      <div
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-[hsl(var(--app-shell-border))] bg-[hsl(var(--app-shell-surface))]"
      >
        <div className="px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 md:grid md:grid-cols-[auto_1fr_auto] md:gap-3">
            <div className="flex min-w-[40px] items-center gap-2">
              {showBackButton ? (
                <BackLinkButton href={backHref} label={t("back")} icon="chevron" className="-ml-2" />
              ) : (
                <div className="h-8 w-8" aria-hidden="true" />
              )}
            </div>

            <div className="order-3 w-full md:order-2 md:flex md:justify-center">
              <button
                type="button"
                onClick={() => setIsGlobalSearchOpen(true)}
                className="flex w-full max-w-[760px] items-center gap-3 rounded-2xl bg-white/72 px-4 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)] transition-colors hover:bg-white/88"
                aria-label={searchPlaceholder}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-muted-foreground shadow-sm">
                  <Search className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium leading-4 text-foreground">
                    {searchPlaceholder}
                  </div>
                </div>
                <span className="hidden rounded-lg bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)] md:inline-flex">
                  Ctrl/Cmd K
                </span>
              </button>
            </div>

            <div className="order-2 ml-auto flex min-w-0 items-center gap-2.5 md:order-3">
              {organizationType === 'partner' ? (
                <div className="min-w-[180px] rounded-2xl bg-white/72 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Destination
                  </div>
                  <div className="truncate text-sm text-foreground">
                    {partnerChannelName ?? 'No destination assigned'}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <GlobalSearchDialog
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        tenantSlug={normalizedTenantSlug}
        organizationType={organizationType}
        activeScope={activeScope}
        placeholder={searchPlaceholder}
        onNavigate={(url) => router.push(url)}
      />
    </>
  )
}
