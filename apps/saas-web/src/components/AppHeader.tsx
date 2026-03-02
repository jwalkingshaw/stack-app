'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useMarketContext } from './market-context'
import { buildTenantPathForScope, splitTenantPathForScope } from '@/lib/tenant-view-scope'

function getNextSelectionId<T extends { id: string }>(
  items: T[],
  selectedId: string | null,
  direction: 'prev' | 'next'
): string | null {
  if (items.length === 0) return null
  if (!selectedId) return items[0].id

  const currentIndex = items.findIndex((item) => item.id === selectedId)
  if (currentIndex === -1) return items[0].id

  if (direction === 'next') {
    return items[(currentIndex + 1) % items.length].id
  }
  return items[(currentIndex - 1 + items.length) % items.length].id
}

export function AppHeader() {
  const headerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const {
    channels,
    markets,
    locales,
    selectedChannelId,
    selectedDestinationId,
    selectedMarketId,
    selectedLocaleId,
    setSelectedChannelId,
    setSelectedDestinationId,
    setSelectedMarketId,
    setSelectedLocaleId,
    availableDestinations,
    availableLocaleIdsForMarket,
    shouldFilterLocalesByMarket
  } = useMarketContext()

  const visibleLocales = shouldFilterLocalesByMarket
    ? locales.filter((locale) => availableLocaleIdsForMarket.has(locale.id))
    : locales

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
    ? buildTenantPathForScope({
        tenantSlug,
        scope: scopeInfo.scope,
        suffix: '/products',
      })
    : '/'

  const canCycleMarkets = isProductDetailPage && markets.length >= 3
  const canCycleChannels = isProductDetailPage && channels.length >= 3
  const canCycleDestinations = isProductDetailPage && availableDestinations.length >= 3

  useEffect(() => {
    if (!showScopeControls && !showBackButton) return

    const updateHeaderHeight = () => {
      if (!headerRef.current) return
      const measuredHeight = headerRef.current.getBoundingClientRect().height
      if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return
      document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(measuredHeight)}px`)
    }

    updateHeaderHeight()

    if (!headerRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateHeaderHeight())
    observer.observe(headerRef.current)
    window.addEventListener('resize', updateHeaderHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
    }
  }, [showScopeControls, showBackButton])

  if (!showScopeControls && !showBackButton) {
    return null
  }

  return (
    <div
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur"
    >
      <div className="px-6 py-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[60px]">
            {showBackButton && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {showScopeControls ? (
              <>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Market</span>
              {canCycleMarkets ? (
                <button
                  type="button"
                  onClick={() => setSelectedMarketId(getNextSelectionId(markets, selectedMarketId, 'prev'))}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Previous market"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <select
                value={selectedMarketId || ''}
                onChange={(e) => setSelectedMarketId(e.target.value || null)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                disabled={markets.length === 0}
              >
                {markets.length === 0 ? (
                  <option value="">No markets</option>
                ) : (
                  markets.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.name}
                    </option>
                  ))
                )}
              </select>
              {canCycleMarkets ? (
                <button
                  type="button"
                  onClick={() => setSelectedMarketId(getNextSelectionId(markets, selectedMarketId, 'next'))}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Next market"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Language</span>
              <select
                value={selectedLocaleId || ''}
                onChange={(e) => setSelectedLocaleId(e.target.value || null)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                disabled={visibleLocales.length === 0}
              >
                {visibleLocales.length === 0 ? (
                  <option value="">No languages</option>
                ) : (
                  visibleLocales.map((locale) => (
                    <option key={locale.id} value={locale.id}>
                      {locale.code}
                    </option>
                  ))
                )}
              </select>
            </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Channel</span>
              {canCycleChannels ? (
                <button
                  type="button"
                  onClick={() => setSelectedChannelId(getNextSelectionId(channels, selectedChannelId, 'prev'))}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Previous channel"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <select
                value={selectedChannelId || ''}
                onChange={(e) => setSelectedChannelId(e.target.value || null)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                disabled={channels.length === 0}
              >
                {channels.length === 0 ? (
                  <option value="">No channels</option>
                ) : (
                  channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))
                )}
              </select>
              {canCycleChannels ? (
                <button
                  type="button"
                  onClick={() => setSelectedChannelId(getNextSelectionId(channels, selectedChannelId, 'next'))}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Next channel"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Destination</span>
              {canCycleDestinations ? (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDestinationId(
                      getNextSelectionId(availableDestinations, selectedDestinationId, 'prev')
                    )
                  }
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Previous destination"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <select
                value={selectedDestinationId || ''}
                onChange={(e) => setSelectedDestinationId(e.target.value || null)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                disabled={availableDestinations.length === 0}
              >
                {availableDestinations.length === 0 ? (
                  <option value="">No destinations</option>
                ) : (
                  availableDestinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                    </option>
                  ))
                )}
              </select>
              {canCycleDestinations ? (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDestinationId(
                      getNextSelectionId(availableDestinations, selectedDestinationId, 'next')
                    )
                  }
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                  aria-label="Next destination"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
              </>
            ) : null}
          </div>
        </div>
        {showScopeControls ? (
          <p className="mt-2 text-right text-[10px] text-muted-foreground">
            Viewing context only. Authoring scope is set during create/upload.
          </p>
        ) : null}
      </div>
    </div>
  )
}
