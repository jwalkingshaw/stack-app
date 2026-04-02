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
  'h-9 rounded-full border-muted/30 bg-background px-3 text-sm shadow-soft'
const stepperClass =
  'inline-flex h-7 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground'

export function ScopeToolbar({
  showCycleControls = true,
  layout = 'horizontal',
}: {
  showCycleControls?: boolean
  layout?: 'horizontal' | 'vertical'
}) {
  const {
    markets,
    locales,
    selectedMarketId,
    selectedLocaleId,
    setSelectedMarketId,
    setSelectedLocaleId,
    availableLocaleIdsForMarket,
    shouldFilterLocalesByMarket,
  } = useMarketContext()

  const visibleLocales = shouldFilterLocalesByMarket
    ? locales.filter((l) => availableLocaleIdsForMarket.has(l.id))
    : locales

  const canCycleMarkets = showCycleControls && markets.length >= 3
  const shouldShowLanguageControl = visibleLocales.length > 0
  const shouldShowMarketControl = markets.length > 0

  const isVertical = layout === 'vertical'
  const containerClass = isVertical
    ? 'flex flex-col gap-2'
    : 'flex items-center gap-3 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
  const itemGroupClass = isVertical ? 'flex flex-col gap-1' : groupClass
  const selectWidth = isVertical ? 'w-full' : ''

  return (
    <div className={containerClass}>
      {/* Market — primary context (regulatory requirements, shared content scope) */}
      {shouldShowMarketControl && (
        <div className={itemGroupClass}>
          <span className={labelClass}>Market</span>
          <div className={groupClass}>
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
                className={`${selectTriggerClass} ${isVertical ? 'flex-1' : 'w-[132px] sm:w-[142px]'}`}
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
        </div>
      )}

      {/* Language — content language within the market */}
      {shouldShowLanguageControl && (
        <div className={itemGroupClass}>
          <span className={labelClass}>Language</span>
          <Select
            value={selectedLocaleId || undefined}
            onValueChange={(value) => setSelectedLocaleId(value || null)}
            disabled={visibleLocales.length <= 1}
          >
            <SelectTrigger
              className={`${selectTriggerClass} ${isVertical ? selectWidth : 'w-[112px] sm:w-[122px]'}`}
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
