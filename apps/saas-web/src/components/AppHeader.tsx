'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { buildTenantPathForScope, splitTenantPathForScope } from '@/lib/tenant-view-scope'
import { hasLiveScopeControls } from '@/lib/scope-visibility'
import { BackLinkButton } from '@/components/ui/back-link-button'
import { useHeaderToolbar } from './header-toolbar-context'
import { useMarketContext } from './market-context'

export function AppHeader() {
  const t = useTranslations("Shell.Header")
  const headerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const { setShowScopeToolbar } = useHeaderToolbar()
  const { channels, destinations, isLoading: marketContextLoading } = useMarketContext()

  const scopeControlMatch = pathname?.match(
    /^\/([^/]+)(?:\/view\/[^/]+)?\/(products|assets)(?:\/.*)?$/
  )
  const isAssetsUploadPage = Boolean(
    pathname?.match(/^\/[^/]+(?:\/view\/[^/]+)?\/assets\/upload(?:\/.*)?$/)
  )
  const showScopeControls = Boolean(scopeControlMatch) && !isAssetsUploadPage

  const productDetailMatch = pathname?.match(
    /^\/([^/]+)(?:\/view\/[^/]+)?\/products\/[^/]+(?:\/variants\/[^/]+)?$/
  )
  const tenantSlug = productDetailMatch?.[1]
  const isProductDetailPage = Boolean(productDetailMatch)
  const scopeInfo = splitTenantPathForScope(pathname, tenantSlug || '')
  const showBackButton = Boolean(tenantSlug)
  const backHref = tenantSlug
    ? buildTenantPathForScope({ tenantSlug, scope: scopeInfo.scope, suffix: '/products' })
    : '/'
  // List pages: inject scope toolbar into PageHeader via boolean context signal.
  // Product detail pages now render scope controls inside their own page headers.
  const isListPageRoute = showScopeControls && !isProductDetailPage
  const shouldRenderListScopeToolbar =
    isListPageRoute &&
    !marketContextLoading &&
    hasLiveScopeControls({ channels, destinations })

  // Sync boolean into context - primitive, never causes infinite loops
  useLayoutEffect(() => {
    setShowScopeToolbar(shouldRenderListScopeToolbar)
    return () => setShowScopeToolbar(false)
  }, [shouldRenderListScopeToolbar, setShowScopeToolbar])

  // Measure header height so product detail panel can calc its own height
  useEffect(() => {
    if (!isProductDetailPage) return

    const updateHeaderHeight = () => {
      if (!headerRef.current) return
      const h = headerRef.current.getBoundingClientRect().height
      if (!Number.isFinite(h) || h <= 0) return
      document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(h)}px`)
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
  }, [isProductDetailPage])

  // List pages: no DOM - scope toolbar is rendered inside PageHeader
  if (isListPageRoute) return null

  // Pages with no controls
  if (!showScopeControls && !showBackButton) return null

  // Product detail: sticky bar with back button only
  return (
    <div
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-border bg-white"
    >
      <div className="px-6 py-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[60px]">
            {showBackButton && (
              <BackLinkButton href={backHref} label={t("back")} className="-ml-2" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
