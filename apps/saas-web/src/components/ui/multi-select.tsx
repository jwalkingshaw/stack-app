"use client"

import * as React from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  contentClassName?: string
  showSelectedChips?: boolean
  maxVisibleChips?: number
  disabled?: boolean
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select one or more options",
  className,
  contentClassName,
  showSelectedChips = true,
  maxVisibleChips = 6,
  disabled = false
}: MultiSelectProps) {
  const selected = new Set(value)
  const labelByValue = React.useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options]
  )

  const handleToggle = (optionValue: string, checked: boolean) => {
    if (disabled) return
    const next = new Set(value)
    if (checked) {
      next.add(optionValue)
    } else {
      next.delete(optionValue)
    }
    onChange(Array.from(next))
  }

  const selectedCount = value.length
  const selectedLabels = value
    .map((selectedValue) => labelByValue.get(selectedValue))
    .filter((label): label is string => Boolean(label))
  const selectedItems = value.map((selectedValue) => ({
    value: selectedValue,
    label: labelByValue.get(selectedValue) || selectedValue
  }))
  const visibleSelectedItems = selectedItems.slice(0, maxVisibleChips)
  const hiddenChipCount = Math.max(0, selectedItems.length - visibleSelectedItems.length)
  const selectedSummary =
    selectedCount === 0
      ? placeholder
      : selectedLabels.length === 0
        ? `${selectedCount} selected`
        : selectedCount <= 2
          ? selectedLabels.join(", ")
          : `${selectedLabels.slice(0, 2).join(", ")} +${selectedCount - 2}`
  const selectedTitle = selectedLabels.length > 0 ? selectedLabels.join(", ") : undefined
  const handleRemove = (optionValue: string) => {
    if (disabled) return
    onChange(value.filter((currentValue) => currentValue !== optionValue))
  }
  const handleClearAll = () => {
    if (disabled) return
    onChange([])
  }

  return (
    <div className="space-y-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-soft transition-colors",
              "hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-muted/40 focus:border-muted/40",
              "disabled:cursor-not-allowed disabled:opacity-60",
              className
            )}
            aria-label={selectedCount > 0 ? `${selectedCount} selected` : placeholder}
            title={selectedTitle}
            disabled={disabled}
          >
            <span className="truncate">{selectedSummary}</span>
            <span className="ml-2 flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Multi
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={cn(
              "z-50 min-w-[12rem] rounded-lg border border-muted/30 bg-white p-1 text-sm shadow-lg outline-none focus-visible:shadow-none",
              contentClassName
            )}
            align="start"
            sideOffset={6}
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No options</div>
            )}
            {options.map((option) => (
              <DropdownMenu.CheckboxItem
                key={option.value}
                checked={selected.has(option.value)}
                onCheckedChange={(checked) => handleToggle(option.value, Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
                disabled={disabled || option.disabled}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none",
                  "focus:bg-muted/50 focus:text-foreground focus:!shadow-none focus-visible:!shadow-none data-[highlighted]:bg-muted/50 data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                )}
              >
                <span
                  className={cn(
                    "absolute left-2 flex h-4 w-4 items-center justify-center rounded border",
                    selected.has(option.value)
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground/40 bg-background text-transparent"
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
                {option.label}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {showSelectedChips && selectedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleSelectedItems.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleRemove(item.value)}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-muted/40 bg-muted/20 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/40"
              aria-label={`Remove ${item.label}`}
              title={`Remove ${item.label}`}
              disabled={disabled}
            >
              <span className="max-w-[16rem] truncate">{item.label}</span>
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          {hiddenChipCount > 0 ? (
            <span className="rounded-md border border-dashed border-muted/50 px-2 py-1 text-xs text-muted-foreground">
              +{hiddenChipCount} more
            </span>
          ) : null}
          {selectedItems.length > 1 && !disabled ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
