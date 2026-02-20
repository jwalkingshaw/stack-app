'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { extractPartnerScopeFromPath, isReservedPartnerScope } from '@/lib/tenant-view-scope'

interface MarketChannel {
  id: string
  code: string
  name: string
  is_active: boolean
}

interface MarketLocale {
  id: string
  code: string
  name: string
  is_active: boolean
}

interface Market {
  id: string
  code: string
  name: string
  is_active: boolean
  is_default?: boolean
}

interface MarketLocaleAssignment {
  id: string
  market_id: string
  locale_id: string
  is_active: boolean
}

interface MarketContextValue {
  channels: MarketChannel[]
  locales: MarketLocale[]
  markets: Market[]
  marketLocales: MarketLocaleAssignment[]
  selectedChannelId: string | null
  selectedMarketId: string | null
  selectedLocaleId: string | null
  selectedChannel: MarketChannel | null
  selectedMarket: Market | null
  selectedLocale: MarketLocale | null
  availableLocaleIdsForMarket: Set<string>
  shouldFilterLocalesByMarket: boolean
  isLoading: boolean
  setSelectedChannelId: (id: string | null) => void
  setSelectedMarketId: (id: string | null) => void
  setSelectedLocaleId: (id: string | null) => void
}

const MarketContext = createContext<MarketContextValue | null>(null)

interface MarketContextProviderProps {
  tenantSlug: string
  children: React.ReactNode
}

export function MarketContextProvider({ tenantSlug, children }: MarketContextProviderProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [channels, setChannels] = useState<MarketChannel[]>([])
  const [locales, setLocales] = useState<MarketLocale[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketLocales, setMarketLocales] = useState<MarketLocaleAssignment[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [selectedLocaleId, setSelectedLocaleId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [persistedCodes, setPersistedCodes] = useState<{
    channelCode: string | null
    marketCode: string | null
    localeCode: string | null
  }>({
    channelCode: null,
    marketCode: null,
    localeCode: null,
  })

  const storageKey = useMemo(() => `market-context:${tenantSlug}`, [tenantSlug])
  const selectedBrandSlug = useMemo(() => {
    const pathScope = extractPartnerScopeFromPath(pathname, tenantSlug)
    if (pathScope) {
      if (
        !isReservedPartnerScope(pathScope) &&
        pathScope !== tenantSlug.toLowerCase()
      ) {
        return pathScope
      }
      // Explicit /view/all or /view/self should override stale query fallback.
      return null
    }

    const fallbackBrand = (searchParams.get('brand') || '').trim().toLowerCase()
    if (
      fallbackBrand &&
      !isReservedPartnerScope(fallbackBrand) &&
      fallbackBrand !== tenantSlug.toLowerCase()
    ) {
      return fallbackBrand
    }

    return null
  }, [pathname, searchParams, tenantSlug])
  const scopeQuery = useMemo(
    () => (selectedBrandSlug ? `?brand=${encodeURIComponent(selectedBrandSlug)}` : ''),
    [selectedBrandSlug]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        setSelectedChannelId(parsed.channelId ?? null)
        setSelectedMarketId(parsed.marketId ?? null)
        setSelectedLocaleId(parsed.localeId ?? null)
        setPersistedCodes({
          channelCode: parsed.channelCode ?? null,
          marketCode: parsed.marketCode ?? null,
          localeCode: parsed.localeCode ?? null,
        })
      }
    } catch (error) {
      console.warn('Failed to load market context selection', error)
    }
  }, [storageKey])

  useEffect(() => {
    const fetchMarkets = async () => {
      if (!tenantSlug) return
      try {
        setIsLoading(true)
        const [channelsRes, localesRes, marketsRes, assignmentsRes] = await Promise.all([
          fetch(`/api/${tenantSlug}/channels${scopeQuery}`),
          fetch(`/api/${tenantSlug}/locales${scopeQuery}`),
          fetch(`/api/${tenantSlug}/markets${scopeQuery}`),
          fetch(`/api/${tenantSlug}/market-locales${scopeQuery}`)
        ])

        if (!channelsRes.ok || !localesRes.ok || !marketsRes.ok || !assignmentsRes.ok) {
          console.warn('Failed to fetch markets settings')
          return
        }

        const [channelsData, localesData, marketsData, assignmentsData] = await Promise.all([
          channelsRes.json(),
          localesRes.json(),
          marketsRes.json(),
          assignmentsRes.json()
        ])

        setChannels((channelsData || []).filter((item: any) => item.is_active))
        setLocales((localesData || []).filter((item: any) => item.is_active))
        setMarkets((marketsData || []).filter((item: any) => item.is_active))
        setMarketLocales((assignmentsData || []).filter((item: any) => item.is_active !== false))
      } catch (error) {
        console.warn('Failed to load markets settings', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMarkets()
  }, [tenantSlug, scopeQuery])

  const availableLocaleIdsForMarket = useMemo(() => {
    if (!selectedMarketId) return new Set<string>()
    const ids = marketLocales
      .filter((item) => item.market_id === selectedMarketId && item.is_active)
      .map((item) => item.locale_id)
    return new Set(ids)
  }, [marketLocales, selectedMarketId])

  const shouldFilterLocalesByMarket = useMemo(() => {
    if (!selectedMarketId) return false
    return marketLocales.some((item) => item.market_id === selectedMarketId)
  }, [marketLocales, selectedMarketId])

  useEffect(() => {
    if (channels.length > 0) {
      const hasSelected = selectedChannelId && channels.some((c) => c.id === selectedChannelId)
      if (!hasSelected) {
        const byCode = persistedCodes.channelCode
          ? channels.find(
              (channel) => channel.code.toLowerCase() === persistedCodes.channelCode?.toLowerCase()
            )
          : null
        setSelectedChannelId(byCode?.id || channels[0].id)
      }
    } else if (selectedChannelId) {
      setSelectedChannelId(null)
    }
  }, [channels, persistedCodes.channelCode, selectedChannelId])

  useEffect(() => {
    if (markets.length > 0) {
      const hasSelected = selectedMarketId && markets.some((m) => m.id === selectedMarketId)
      if (!hasSelected) {
        const byCode = persistedCodes.marketCode
          ? markets.find(
              (market) => market.code.toLowerCase() === persistedCodes.marketCode?.toLowerCase()
            )
          : null
        const defaultMarket = markets.find((market) => market.is_default)
        setSelectedMarketId(byCode?.id || defaultMarket?.id || markets[0].id)
      }
    } else if (selectedMarketId) {
      setSelectedMarketId(null)
    }
  }, [markets, persistedCodes.marketCode, selectedMarketId])

  useEffect(() => {
    if (locales.length === 0) {
      if (selectedLocaleId) setSelectedLocaleId(null)
      return
    }

    const allowedLocaleIds = shouldFilterLocalesByMarket
      ? locales
          .filter((locale) => availableLocaleIdsForMarket.has(locale.id))
          .map((locale) => locale.id)
      : locales.map((locale) => locale.id)

    if (allowedLocaleIds.length === 0) {
      return
    }

    const hasSelected = selectedLocaleId && allowedLocaleIds.includes(selectedLocaleId)
    if (!hasSelected) {
      const byCode = persistedCodes.localeCode
        ? locales.find(
            (locale) =>
              locale.code.toLowerCase() === persistedCodes.localeCode?.toLowerCase() &&
              allowedLocaleIds.includes(locale.id)
          )
        : null
      setSelectedLocaleId(byCode?.id || allowedLocaleIds[0])
    }
  }, [
    locales,
    selectedLocaleId,
    shouldFilterLocalesByMarket,
    availableLocaleIdsForMarket,
    persistedCodes.localeCode,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const selectedChannelCode =
      channels.find((channel) => channel.id === selectedChannelId)?.code ??
      persistedCodes.channelCode ??
      null
    const selectedMarketCode =
      markets.find((market) => market.id === selectedMarketId)?.code ??
      persistedCodes.marketCode ??
      null
    const selectedLocaleCode =
      locales.find((locale) => locale.id === selectedLocaleId)?.code ??
      persistedCodes.localeCode ??
      null
    const payload = {
      channelId: selectedChannelId,
      marketId: selectedMarketId,
      localeId: selectedLocaleId,
      channelCode: selectedChannelCode,
      marketCode: selectedMarketCode,
      localeCode: selectedLocaleCode,
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload))
      setPersistedCodes({
        channelCode: selectedChannelCode,
        marketCode: selectedMarketCode,
        localeCode: selectedLocaleCode,
      })
    } catch (error) {
      console.warn('Failed to persist market context selection', error)
    }
  }, [
    channels,
    locales,
    markets,
    persistedCodes.channelCode,
    persistedCodes.marketCode,
    persistedCodes.localeCode,
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    storageKey,
  ])

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) || null,
    [channels, selectedChannelId]
  )

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) || null,
    [markets, selectedMarketId]
  )

  const selectedLocale = useMemo(
    () => locales.find((locale) => locale.id === selectedLocaleId) || null,
    [locales, selectedLocaleId]
  )

  const value: MarketContextValue = {
    channels,
    locales,
    markets,
    marketLocales,
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    selectedChannel,
    selectedMarket,
    selectedLocale,
    availableLocaleIdsForMarket,
    shouldFilterLocalesByMarket,
    isLoading,
    setSelectedChannelId,
    setSelectedMarketId,
    setSelectedLocaleId
  }

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarketContext() {
  const context = useContext(MarketContext)
  if (!context) {
    throw new Error('useMarketContext must be used within MarketContextProvider')
  }
  return context
}
