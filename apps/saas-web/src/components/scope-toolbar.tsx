'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMarketContext } from './market-context'
import { getLocaleDisplayName } from '@/lib/locale-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function getNextSelectionId<T extends { id: string }>(
  items: T[],
  selectedId: string | null,
  direction: 'prev' | 'next'
): string | null {
  if (items.length === 0) return null
  if (!selectedId) return items[0].id
  const currentIndex = items.findIndex((item) => item.id === selectedId)
  if (currentIndex === -1) return items[0].id
  if (direction === 'next') return items[(currentIndex + 1) % items.length].id
  return items[(currentIndex - 1 + items.length) % items.length].id
}

const labelClass = 'text-[11px] font-medium text-muted-foreground'
const groupClass = 'flex shrink-0 items-center gap-1'
const selectTriggerClass =
  'h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground shadow-none'
const stepperClass =
  'inline-flex h-7 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground'

export function ScopeToolbar({ showCycleControls = true }: { showCycleControls?: boolean }) {
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
    shouldFilterLocalesByMarket,
  } = useMarketContext()

  const visibleLocales = shouldFilterLocalesByMarket
    ? locales.filter((l) => availableLocaleIdsForMarket.has(l.id))
    : locales

  const canCycleMarkets = showCycleControls && markets.length >= 3
  const canCycleChannels = showCycleControls && channels.length >= 3
  const canCycleDestinations = showCycleControls && availableDestinations.length >= 3
  const shouldShowLanguageControl = visibleLocales.length !== 1

  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Market */}
      <div className={groupClass}>
        <span className={labelClass}>Market</span>
        {canCycleMarkets && (
          <button
            type="button"
            onClick={() => setSelectedMarketId(getNextSelectionId(markets, selectedMarketId, 'prev'))}
            className={stepperClass}
            aria-label="Previous market"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <Select
          value={selectedMarketId || undefined}
          onValueChange={(value) => setSelectedMarketId(value || null)}
          disabled={markets.length === 0}
        >
          <SelectTrigger
            className={`${selectTriggerClass} w-[132px] sm:w-[142px]`}
            disabled={markets.length === 0}
          >
            <SelectValue placeholder="No markets" />
          </SelectTrigger>
          {markets.length > 0 ? (
            <SelectContent>
              {markets.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>
        {canCycleMarkets && (
          <button
            type="button"
            onClick={() => setSelectedMarketId(getNextSelectionId(markets, selectedMarketId, 'next'))}
            className={stepperClass}
            aria-label="Next market"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Channel */}
      <div className={groupClass}>
        <span className={labelClass}>Channel</span>
        {canCycleChannels && (
          <button
            type="button"
            onClick={() => setSelectedChannelId(getNextSelectionId(channels, selectedChannelId, 'prev'))}
            className={stepperClass}
            aria-label="Previous channel"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <Select
          value={selectedChannelId || undefined}
          onValueChange={(value) => setSelectedChannelId(value || null)}
          disabled={channels.length === 0}
        >
          <SelectTrigger
            className={`${selectTriggerClass} w-[132px] sm:w-[142px]`}
            disabled={channels.length === 0}
          >
            <SelectValue placeholder="No channels" />
          </SelectTrigger>
          {channels.length > 0 ? (
            <SelectContent>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>
        {canCycleChannels && (
          <button
            type="button"
            onClick={() => setSelectedChannelId(getNextSelectionId(channels, selectedChannelId, 'next'))}
            className={stepperClass}
            aria-label="Next channel"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Destination */}
      {availableDestinations.length > 0 && (
        <div className={groupClass}>
          <span className={labelClass}>Destination</span>
          {canCycleDestinations && (
            <button
              type="button"
              onClick={() => setSelectedDestinationId(getNextSelectionId(availableDestinations, selectedDestinationId, 'prev'))}
              className={stepperClass}
              aria-label="Previous destination"
            >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
          <Select
            value={selectedDestinationId || undefined}
            onValueChange={(value) => setSelectedDestinationId(value || null)}
          >
            <SelectTrigger className={`${selectTriggerClass} w-[132px] sm:w-[142px]`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableDestinations.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCycleDestinations && (
            <button
              type="button"
              onClick={() => setSelectedDestinationId(getNextSelectionId(availableDestinations, selectedDestinationId, 'next'))}
              className={stepperClass}
              aria-label="Next destination"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Language */}
      {shouldShowLanguageControl && (
        <div className={groupClass}>
          <span className={labelClass}>Language</span>
          <Select
            value={selectedLocaleId || undefined}
            onValueChange={(value) => setSelectedLocaleId(value || null)}
            disabled={visibleLocales.length === 0}
          >
            <SelectTrigger
              className={`${selectTriggerClass} w-[112px] sm:w-[122px]`}
              disabled={visibleLocales.length === 0}
            >
              <SelectValue placeholder="No languages" />
            </SelectTrigger>
            {visibleLocales.length > 0 ? (
              <SelectContent>
                {visibleLocales.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {getLocaleDisplayName(l, visibleLocales)}
                  </SelectItem>
                ))}
              </SelectContent>
            ) : null}
          </Select>
        </div>
      )}
    </div>
  )
}
