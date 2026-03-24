'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { extractPartnerScopeFromPath, isReservedPartnerScope } from '@/lib/tenant-view-scope'

interface MarketChannel {
  id: string
  code: string
  name: string
  is_active: boolean
  sort_order?: number | null
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

function sortBySortOrderThenName<T extends { name?: string | null; sort_order?: number | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const orderA =
      typeof a.sort_order === 'number' && Number.isFinite(a.sort_order) ? a.sort_order : 0
    const orderB =
      typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : 0
    if (orderA !== orderB) return orderA - orderB
    const nameA = String(a.name || '')
    const nameB = String(b.name || '')
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
}

function sortByName<T extends { name?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  )
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

type ScopeSelectionMode = 'auto' | 'global' | 'specific'

const MarketContext = createContext<MarketContextValue | null>(null)

interface MarketContextProviderProps {
  tenantSlug: string
  children: React.ReactNode
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const toActiveItems = <T,>(value: unknown): T[] =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is T => isRecord(item) && item.is_active === true)

const toNonInactiveItems = <T,>(value: unknown): T[] =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is T => isRecord(item) && item.is_active !== false)

const parseJsonSafely = async (response: Response): Promise<unknown | null> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const MARKET_CONTEXT_REFRESH_EVENT = 'market-context:refresh'

export function MarketContextProvider({ tenantSlug, children }: MarketContextProviderProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [channels, setChannels] = useState<MarketChannel[]>([])
  const [locales, setLocales] = useState<MarketLocale[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [destinations, setDestinations] = useState<MarketDestination[]>([])
  const [marketLocales, setMarketLocales] = useState<MarketLocaleAssignment[]>([])
  const [selectedChannelId, setSelectedChannelIdState] = useState<string | null>(null)
  const [selectedMarketId, setSelectedMarketIdState] = useState<string | null>(null)
  const [selectedLocaleId, setSelectedLocaleIdState] = useState<string | null>(null)
  const [selectedDestinationId, setSelectedDestinationIdState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasHydratedSelection, setHasHydratedSelection] = useState(false)
  const [selectionMode, setSelectionMode] = useState<{
    channel: ScopeSelectionMode
    destination: ScopeSelectionMode
  }>({
    channel: 'auto',
    destination: 'auto',
  })
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
        let parsed: unknown = null
        try {
          parsed = JSON.parse(stored)
        } catch {
          // Corrupt persisted context should not keep failing page loads.
          window.localStorage.removeItem(storageKey)
        }

        if (isRecord(parsed)) {
          setSelectedChannelIdState(typeof parsed.channelId === 'string' ? parsed.channelId : null)
          setSelectedMarketIdState(typeof parsed.marketId === 'string' ? parsed.marketId : null)
          setSelectedLocaleIdState(typeof parsed.localeId === 'string' ? parsed.localeId : null)
          setSelectedDestinationIdState(
            typeof parsed.destinationId === 'string' ? parsed.destinationId : null
          )
          const channelMode =
            parsed.channelMode === 'global' ||
            parsed.channelMode === 'specific' ||
            parsed.channelMode === 'auto'
              ? parsed.channelMode
              : 'auto'
          const destinationMode =
            parsed.destinationMode === 'global' ||
            parsed.destinationMode === 'specific' ||
            parsed.destinationMode === 'auto'
              ? parsed.destinationMode
              : 'auto'
          setSelectionMode({
            channel: channelMode,
            destination: destinationMode,
          })
          setPersistedCodes({
            channelCode: typeof parsed.channelCode === 'string' ? parsed.channelCode : null,
            marketCode: typeof parsed.marketCode === 'string' ? parsed.marketCode : null,
            localeCode: typeof parsed.localeCode === 'string' ? parsed.localeCode : null,
            destinationCode:
              typeof parsed.destinationCode === 'string' ? parsed.destinationCode : null,
          })
        }
      }
    } catch (error) {
      console.warn('Failed to load market context selection', error)
    } finally {
      setHasHydratedSelection(true)
    }
  }, [storageKey])

  const setSelectedChannelId = useCallback((id: string | null) => {
    setSelectedChannelIdState(id)
    setSelectionMode((current) => ({
      channel: id ? 'specific' : 'global',
      destination: id ? current.destination : 'global',
    }))
    if (!id) {
      setSelectedDestinationIdState(null)
    }
  }, [])

  const setSelectedMarketId = useCallback((id: string | null) => {
    setSelectedMarketIdState(id)
  }, [])

  const setSelectedLocaleId = useCallback((id: string | null) => {
    setSelectedLocaleIdState(id)
  }, [])

  const setSelectedDestinationId = useCallback((id: string | null) => {
    setSelectedDestinationIdState(id)
    setSelectionMode((current) => ({
      ...current,
      destination: id ? 'specific' : 'global',
    }))
  }, [])

  const fetchMarkets = useCallback(async () => {
    if (!tenantSlug) return
    try {
      setIsLoading(true)
      const contextRes = await fetch(`/api/${tenantSlug}/market-context${scopeQuery}`)
      const contextData = await parseJsonSafely(contextRes)

      if (contextRes.ok && isRecord(contextData)) {
        setChannels(sortByName(toActiveItems<MarketChannel>(contextData.channels)))
        setLocales(toActiveItems<MarketLocale>(contextData.locales))
        setMarkets(toActiveItems<Market>(contextData.markets))
        setMarketLocales(toNonInactiveItems<MarketLocaleAssignment>(contextData.marketLocales))
        setDestinations(
          sortBySortOrderThenName(toNonInactiveItems<MarketDestination>(contextData.destinations))
        )
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

      setChannels(sortByName(toActiveItems<MarketChannel>(channelsData)))
      setLocales(toActiveItems<MarketLocale>(localesData))
      setMarkets(toActiveItems<Market>(marketsData))
      setMarketLocales(toNonInactiveItems<MarketLocaleAssignment>(assignmentsData))
      setDestinations(
        sortBySortOrderThenName(toNonInactiveItems<MarketDestination>(destinationsData))
      )
    } catch (error) {
      console.warn('Failed to load markets settings', error)
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug, scopeQuery])

  useEffect(() => {
    void fetchMarkets()
  }, [fetchMarkets])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleRefresh = () => {
      void fetchMarkets()
    }
    window.addEventListener(MARKET_CONTEXT_REFRESH_EVENT, handleRefresh)
    return () => {
      window.removeEventListener(MARKET_CONTEXT_REFRESH_EVENT, handleRefresh)
    }
  }, [fetchMarkets])

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
    if (destinations.length === 0 || !selectedChannelId) return []

    return sortBySortOrderThenName(
      destinations.filter((destination) => {
        const matchesChannel = destination.channel_id === selectedChannelId
        const matchesMarket = !destination.market_id || destination.market_id === selectedMarketId
        return matchesChannel && matchesMarket
      })
    )
  }, [destinations, selectedChannelId, selectedMarketId])

  useEffect(() => {
    if (!hasHydratedSelection) return
    if (channels.length > 0) {
      const hasSelected = selectedChannelId && channels.some((c) => c.id === selectedChannelId)
      if (!hasSelected) {
        if (selectionMode.channel === 'global') {
          if (selectedChannelId !== null) {
            setSelectedChannelIdState(null)
          }
          return
        }
        const byCode = persistedCodes.channelCode
          ? channels.find(
              (channel) => channel.code.toLowerCase() === persistedCodes.channelCode?.toLowerCase()
            )
          : null
        setSelectedChannelIdState(byCode?.id || channels[0].id)
      }
    } else if (selectedChannelId) {
      setSelectedChannelIdState(null)
    }
  }, [
    channels,
    hasHydratedSelection,
    persistedCodes.channelCode,
    selectedChannelId,
    selectionMode.channel,
  ])

  useEffect(() => {
    if (!hasHydratedSelection) return
    if (markets.length > 0) {
      const hasSelected = selectedMarketId && markets.some((m) => m.id === selectedMarketId)
      if (!hasSelected) {
        // ?market=[code] URL param takes priority (used by partner portal market switcher)
        const urlMarketCode = (searchParams.get('market') || '').trim().toUpperCase()
        const byUrlCode = urlMarketCode
          ? markets.find((market) => market.code.toUpperCase() === urlMarketCode)
          : null
        const byCode = persistedCodes.marketCode
          ? markets.find(
              (market) => market.code.toLowerCase() === persistedCodes.marketCode?.toLowerCase()
            )
          : null
        const defaultMarket = markets.find((market) => market.is_default)
        setSelectedMarketIdState(byUrlCode?.id || byCode?.id || defaultMarket?.id || markets[0].id)
      }
    } else if (selectedMarketId) {
      setSelectedMarketIdState(null)
    }
  }, [hasHydratedSelection, markets, persistedCodes.marketCode, searchParams, selectedMarketId])

  useEffect(() => {
    if (!hasHydratedSelection) return
    if (locales.length === 0) {
      if (selectedLocaleId) setSelectedLocaleIdState(null)
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
      setSelectedLocaleIdState(byCode?.id || allowedLocaleIds[0])
    }
  }, [
    hasHydratedSelection,
    locales,
    selectedLocaleId,
    shouldFilterLocalesByMarket,
    availableLocaleIdsForMarket,
    persistedCodes.localeCode,
  ])

  useEffect(() => {
    if (!hasHydratedSelection) return
    if (availableDestinations.length === 0) {
      if (selectedDestinationId) setSelectedDestinationIdState(null)
      return
    }

    const hasSelected =
      selectedDestinationId &&
      availableDestinations.some((destination) => destination.id === selectedDestinationId)

    if (!hasSelected) {
      if (selectionMode.destination === 'global') {
        if (selectedDestinationId !== null) {
          setSelectedDestinationIdState(null)
        }
        return
      }
      const byCode = persistedCodes.destinationCode
        ? availableDestinations.find(
            (destination) =>
              destination.code.toLowerCase() === persistedCodes.destinationCode?.toLowerCase()
          )
        : null
      setSelectedDestinationIdState(byCode?.id || availableDestinations[0].id)
    }
  }, [
    availableDestinations,
    hasHydratedSelection,
    persistedCodes.destinationCode,
    selectedDestinationId,
    selectionMode.destination,
  ])

  useEffect(() => {
    if (!hasHydratedSelection) return
    if (typeof window === 'undefined') return
    const selectedChannelCode =
      channels.find((channel) => channel.id === selectedChannelId)?.code ?? null
    const selectedMarketCode = markets.find((market) => market.id === selectedMarketId)?.code ?? null
    const selectedLocaleCode = locales.find((locale) => locale.id === selectedLocaleId)?.code ?? null
    const selectedDestinationCode =
      destinations.find((destination) => destination.id === selectedDestinationId)?.code ?? null
    const payload = {
      channelId: selectedChannelId,
      marketId: selectedMarketId,
      localeId: selectedLocaleId,
      destinationId: selectedDestinationId,
      channelMode: selectionMode.channel,
      destinationMode: selectionMode.destination,
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
    hasHydratedSelection,
    locales,
    markets,
    selectionMode.channel,
    selectionMode.destination,
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
