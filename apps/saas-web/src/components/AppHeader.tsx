'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useMarketContext } from './market-context'
import { buildTenantPathForScope, splitTenantPathForScope } from '@/lib/tenant-view-scope'

export function AppHeader() {
  const pathname = usePathname()
  const {
    channels,
    markets,
    locales,
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    setSelectedChannelId,
    setSelectedMarketId,
    setSelectedLocaleId,
    availableLocaleIdsForMarket,
    shouldFilterLocalesByMarket,
    isLoading
  } = useMarketContext()

  const visibleLocales = shouldFilterLocalesByMarket
    ? locales.filter((locale) => availableLocaleIdsForMarket.has(locale.id))
    : locales

  const productDetailMatch = pathname?.match(
    /^\/([^/]+)(?:\/view\/[^/]+)?\/products\/[^/]+(?:\/variants\/[^/]+)?$/
  )
  const tenantSlug = productDetailMatch?.[1]
  const scopeInfo = splitTenantPathForScope(pathname, tenantSlug || '')
  const showBackButton = Boolean(tenantSlug)
  const backHref = tenantSlug
    ? buildTenantPathForScope({
        tenantSlug,
        scope: scopeInfo.scope,
        suffix: '/products',
      })
    : '/'

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
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
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Market</span>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
