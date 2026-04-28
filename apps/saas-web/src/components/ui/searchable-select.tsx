"use client"

import * as React from "react"
import { SearchInput } from "@/components/ui/search-input"
import { cn } from "@/lib/utils"

export interface SearchableSelectOption {
  value: string
  label: string
  secondaryLabel?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value?: string
  onValueChange: (value: string) => void
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  emptyMessage = "No options match your search.",
  className,
}: SearchableSelectProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <SearchInput
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="max-w-none"
      />

      <div className="max-h-72 overflow-y-auto rounded-md border border-muted/30 bg-white">
        {options.length > 0 ? (
          options.map((option) => {
            const isSelected = value === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-3 border-b border-muted/20 px-3 py-2 text-left text-sm transition-colors last:border-b-0",
                  isSelected ? "bg-muted/40" : "hover:bg-muted/20"
                )}
                onClick={() => onValueChange(option.value)}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{option.label}</div>
                  {option.secondaryLabel ? (
                    <div className="text-xs text-muted-foreground">{option.secondaryLabel}</div>
                  ) : null}
                </div>
                {isSelected ? <span className="text-xs font-medium text-foreground">Selected</span> : null}
              </button>
            )
          })
        ) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </div>
    </div>
  )
}
