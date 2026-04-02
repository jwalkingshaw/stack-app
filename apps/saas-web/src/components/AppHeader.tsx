'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { buildTenantPathForScope, splitTenantPathForScope } from '@/lib/tenant-view-scope'
import { BackLinkButton } from '@/components/ui/back-link-button'

export function AppHeader() {
  const t = useTranslations("Shell.Header")
  const headerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()

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

  if (!showBackButton) return null

  return (
    <div
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-gray-200 bg-white"
    >
      <div className="px-6 py-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[60px]">
            <BackLinkButton href={backHref} label={t("back")} icon="chevron" className="-ml-2" />
          </div>
        </div>
      </div>
    </div>
  )
}
