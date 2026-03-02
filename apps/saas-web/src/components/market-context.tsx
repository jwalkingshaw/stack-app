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

interface MarketDestination {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  channel_id: string | null
  market_id: string | null
  sort_order: number
}

interface MarketContextValue {
  channels: MarketChannel[]
  locales: MarketLocale[]
  markets: Market[]
  destinations: MarketDestination[]
  marketLocales: MarketLocaleAssignment[]
  selectedChannelId: string | null
  selectedMarketId: string | null
  selectedLocaleId: string | null
  selectedDestinationId: string | null
  selectedChannel: MarketChannel | null
  selectedMarket: Market | null
  selectedLocale: MarketLocale | null
  selectedDestination: MarketDestination | null
  availableDestinations: MarketDestination[]
  availableLocaleIdsForMarket: Set<string>
  shouldFilterLocalesByMarket: boolean
  isLoading: boolean
  setSelectedChannelId: (id: string | null) => void
  setSelectedMarketId: (id: string | null) => void
  setSelectedLocaleId: (id: string | null) => void
  setSelectedDestinationId: (id: string | null) => void
}

const MarketContext = createContext<MarketContextValue | null>(null)

interface MarketContextProviderProps {
  tenantSlug: string
  children: React.ReactNode
}

const parseJsonSafely = async (response: Response): Promise<any | null> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function MarketContextProvider({ tenantSlug, children }: MarketContextProviderProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [channels, setChannels] = useState<MarketChannel[]>([])
  const [locales, setLocales] = useState<MarketLocale[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [destinations, setDestinations] = useState<MarketDestination[]>([])
  const [marketLocales, setMarketLocales] = useState<MarketLocaleAssignment[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [selectedLocaleId, setSelectedLocaleId] = useState<string | null>(null)
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [persistedCodes, setPersistedCodes] = useState<{
    channelCode: string | null
    marketCode: string | null
    localeCode: string | null
    destinationCode: string | null
  }>({
    channelCode: null,
    marketCode: null,
    localeCode: null,
    destinationCode: null,
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
        let parsed: any = null
        try {
          parsed = JSON.parse(stored)
        } catch {
          // Corrupt persisted context should not keep failing page loads.
          window.localStorage.removeItem(storageKey)
        }

        if (parsed && typeof parsed === 'object') {
          setSelectedChannelId(parsed.channelId ?? null)
          setSelectedMarketId(parsed.marketId ?? null)
          setSelectedLocaleId(parsed.localeId ?? null)
          setSelectedDestinationId(parsed.destinationId ?? null)
          setPersistedCodes({
            channelCode: parsed.channelCode ?? null,
            marketCode: parsed.marketCode ?? null,
            localeCode: parsed.localeCode ?? null,
            destinationCode: parsed.destinationCode ?? null,
          })
        }
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
        const contextRes = await fetch(`/api/${tenantSlug}/market-context${scopeQuery}`)
        const contextData = await parseJsonSafely(contextRes)

        if (contextRes.ok && contextData && typeof contextData === 'object') {
          setChannels((Array.isArray((contextData as any).channels) ? (contextData as any).channels : []).filter((item: any) => item.is_active))
          setLocales((Array.isArray((contextData as any).locales) ? (contextData as any).locales : []).filter((item: any) => item.is_active))
          setMarkets((Array.isArray((contextData as any).markets) ? (contextData as any).markets : []).filter((item: any) => item.is_active))
          setMarketLocales((Array.isArray((contextData as any).marketLocales) ? (contextData as any).marketLocales : []).filter((item: any) => item.is_active !== false))
          setDestinations((Array.isArray((contextData as any).destinations) ? (contextData as any).destinations : []).filter((item: any) => item.is_active !== false))
          return
        }

        // Fallback: keep legacy multi-endpoint flow for compatibility.
        const [channelsRes, localesRes, marketsRes, assignmentsRes, destinationsRes] = await Promise.all([
          fetch(`/api/${tenantSlug}/channels${scopeQuery}`),
          fetch(`/api/${tenantSlug}/locales${scopeQuery}`),
          fetch(`/api/${tenantSlug}/markets${scopeQuery}`),
          fetch(`/api/${tenantSlug}/market-locales${scopeQuery}`),
          fetch(`/api/${tenantSlug}/destinations${scopeQuery}`)
        ])

        if (
          !channelsRes.ok ||
          !localesRes.ok ||
          !marketsRes.ok ||
          !assignmentsRes.ok ||
          !destinationsRes.ok
        ) {
          console.warn('Failed to fetch markets settings')
          return
        }

        const [channelsData, localesData, marketsData, assignmentsData, destinationsData] = await Promise.all([
          parseJsonSafely(channelsRes),
          parseJsonSafely(localesRes),
          parseJsonSafely(marketsRes),
          parseJsonSafely(assignmentsRes),
          parseJsonSafely(destinationsRes)
        ])

        setChannels((Array.isArray(channelsData) ? channelsData : []).filter((item: any) => item.is_active))
        setLocales((Array.isArray(localesData) ? localesData : []).filter((item: any) => item.is_active))
        setMarkets((Array.isArray(marketsData) ? marketsData : []).filter((item: any) => item.is_active))
        setMarketLocales((Array.isArray(assignmentsData) ? assignmentsData : []).filter((item: any) => item.is_active !== false))
        setDestinations((Array.isArray(destinationsData) ? destinationsData : []).filter((item: any) => item.is_active !== false))
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

  const availableDestinations = useMemo(() => {
    if (destinations.length === 0) return []

    return destinations.filter((destination) => {
      const matchesChannel =
        !destination.channel_id ||
        !selectedChannelId ||
        destination.channel_id === selectedChannelId
      const matchesMarket =
        !destination.market_id ||
        !selectedMarketId ||
        destination.market_id === selectedMarketId
      return matchesChannel && matchesMarket
    })
  }, [destinations, selectedChannelId, selectedMarketId])

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
    if (availableDestinations.length === 0) {
      if (selectedDestinationId) setSelectedDestinationId(null)
      return
    }

    const hasSelected =
      selectedDestinationId &&
      availableDestinations.some((destination) => destination.id === selectedDestinationId)

    if (!hasSelected) {
      const byCode = persistedCodes.destinationCode
        ? availableDestinations.find(
            (destination) =>
              destination.code.toLowerCase() === persistedCodes.destinationCode?.toLowerCase()
          )
        : null
      setSelectedDestinationId(byCode?.id || availableDestinations[0].id)
    }
  }, [availableDestinations, persistedCodes.destinationCode, selectedDestinationId])

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
    const selectedDestinationCode =
      destinations.find((destination) => destination.id === selectedDestinationId)?.code ??
      persistedCodes.destinationCode ??
      null
    const payload = {
      channelId: selectedChannelId,
      marketId: selectedMarketId,
      localeId: selectedLocaleId,
      destinationId: selectedDestinationId,
      channelCode: selectedChannelCode,
      marketCode: selectedMarketCode,
      localeCode: selectedLocaleCode,
      destinationCode: selectedDestinationCode,
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload))
      setPersistedCodes({
        channelCode: selectedChannelCode,
        marketCode: selectedMarketCode,
        localeCode: selectedLocaleCode,
        destinationCode: selectedDestinationCode,
      })
    } catch (error) {
      console.warn('Failed to persist market context selection', error)
    }
  }, [
    channels,
    destinations,
    locales,
    markets,
    persistedCodes.channelCode,
    persistedCodes.destinationCode,
    persistedCodes.marketCode,
    persistedCodes.localeCode,
    selectedChannelId,
    selectedDestinationId,
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

  const selectedDestination = useMemo(
    () => destinations.find((destination) => destination.id === selectedDestinationId) || null,
    [destinations, selectedDestinationId]
  )

  const value: MarketContextValue = {
    channels,
    locales,
    markets,
    destinations,
    marketLocales,
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    selectedDestinationId,
    selectedChannel,
    selectedMarket,
    selectedLocale,
    selectedDestination,
    availableDestinations,
    availableLocaleIdsForMarket,
    shouldFilterLocalesByMarket,
    isLoading,
    setSelectedChannelId,
    setSelectedMarketId,
    setSelectedLocaleId,
    setSelectedDestinationId
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
