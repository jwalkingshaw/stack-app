'use client'

import type { ReactNode } from 'react'
import { ChevronRight, Lock, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ItemListProps<T> {
  items: T[]
  getKey: (item: T) => string
  renderTitle: (item: T) => ReactNode
  renderSubtitle?: (item: T) => ReactNode
  getStatus?: (item: T) => 'active' | 'inactive' | null
  /** Slot to the left of the chevron/lock — badge, toggle, dropdown, count, anything */
  renderRight?: (item: T) => ReactNode
  /** Makes the row clickable and shows a chevron on the right */
  onClickItem?: (item: T) => void
  /** Row shows a lock icon and is not clickable */
  isLocked?: (item: T) => boolean
  loading?: boolean
  loadingRows?: number
  emptyMessage?: string
  className?: string
  /**
   * When set, a header row is shown above the list.
   * Shows "{items.length} {headerLabel}" on the left.
   */
  headerLabel?: string
  /**
   * Free action slot rendered in the header's right side.
   * Typically a small icon button (+ add) or a full Button.
   */
  headerAction?: ReactNode
  /**
   * Standard create action shown in header when `headerAction` is not provided.
   * Renders a "+ Add ..." button.
   */
  onCreate?: () => void
  createLabel?: string
  showIndicator?: boolean
}

export function ItemList<T>({
  items,
  getKey,
  renderTitle,
  renderSubtitle,
  getStatus,
  renderRight,
  onClickItem,
  isLocked,
  loading = false,
  loadingRows = 6,
  emptyMessage = 'No items found.',
  className,
  headerLabel,
  headerAction,
  onCreate,
  createLabel,
  showIndicator = true,
}: ItemListProps<T>) {
  const showDefaultCreateAction = !headerAction && !!onCreate && !!createLabel
  const showHeader = !!(headerLabel || headerAction || showDefaultCreateAction)

  return (
    <div className={cn('overflow-hidden rounded-lg border border-gray-200', className)}>
      {/* Optional header row */}
      {showHeader && (
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          {headerLabel ? (
            <span className="text-xs font-medium text-muted-foreground">
              {loading ? '—' : items.length} {headerLabel}
            </span>
          ) : (
            <span />
          )}
          {headerAction && (
            <div className="flex items-center">{headerAction}</div>
          )}
          {!headerAction && showDefaultCreateAction && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={createLabel}
            >
              <Plus className="h-4 w-4" />
              <span>{createLabel}</span>
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div key={i} className="relative flex items-center gap-4 px-4 py-3">
              {i > 0 && <div className="absolute left-4 right-4 top-0 h-px bg-gray-200" />}
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                {renderSubtitle && <div className="h-3 w-24 animate-pulse rounded bg-muted" />}
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div>
          {items.map((item, index) => {
            const locked = isLocked?.(item) ?? false
            const clickable = !!onClickItem && !locked
            const subtitle = renderSubtitle?.(item)
            const status = getStatus?.(item) ?? null

            return (
              <div
                key={getKey(item)}
                role={clickable ? 'button' : undefined}
                onClick={clickable ? () => onClickItem(item) : undefined}
                className={cn(
                  'group relative flex items-center gap-4 px-4 py-3 transition-colors',
                  clickable && 'cursor-pointer hover:bg-muted/30'
                )}
              >
                {index > 0 && (
                  <div className="absolute left-4 right-4 top-0 h-px bg-gray-200" />
                )}

                {/* Title + subtitle */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {renderTitle(item)}
                  </div>
                  {subtitle ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {subtitle}
                    </div>
                  ) : null}
                </div>

                {/* Free right-hand slot */}
                {renderRight && (
                  <div className="flex shrink-0 items-center">
                    {renderRight(item)}
                  </div>
                )}

                {/* Fixed indicator slot — lock or chevron */}
                {status ? (
                  <div className="flex shrink-0 items-center">
                    <span
                      className={cn(
                        'inline-block h-2.5 w-2.5 rounded-full',
                        status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                      )}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{status === 'active' ? 'Active' : 'Inactive'}</span>
                  </div>
                ) : null}

                {showIndicator ? (
                  <div className="flex w-5 shrink-0 items-center justify-end">
                    {locked ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                    ) : onClickItem ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
