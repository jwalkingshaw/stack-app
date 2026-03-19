'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { buildTenantPathForScope, splitTenantPathForScope } from '@/lib/tenant-view-scope'
import { BackLinkButton } from '@/components/ui/back-link-button'
import { useHeaderToolbar } from './header-toolbar-context'

export function AppHeader() {
  const headerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const { setShowScopeToolbar } = useHeaderToolbar()

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
  const isListPage = showScopeControls && !isProductDetailPage

  // Sync boolean into context — primitive, never causes infinite loops
  useLayoutEffect(() => {
    setShowScopeToolbar(isListPage)
    return () => setShowScopeToolbar(false)
  }, [isListPage, setShowScopeToolbar])

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

  // List pages: no DOM — scope toolbar is rendered inside PageHeader
  if (isListPage) return null

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
              <BackLinkButton href={backHref} label="Back" className="-ml-2" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
