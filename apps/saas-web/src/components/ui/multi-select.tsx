"use client"

import * as React from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown } from "lucide-react"
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
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options",
  className,
  contentClassName
}: MultiSelectProps) {
  const selected = new Set(value)

  const handleToggle = (optionValue: string, checked: boolean) => {
    const next = new Set(value)
    if (checked) {
      next.add(optionValue)
    } else {
      next.delete(optionValue)
    }
    onChange(Array.from(next))
  }

  const label = value.length > 0 ? `${value.length} selected` : placeholder

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-soft transition-colors",
            "hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-muted/40 focus:border-muted/40",
            className
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
              disabled={option.disabled}
              className={cn(
                "relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none",
                "focus:bg-muted/50 focus:!shadow-none focus-visible:!shadow-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              )}
            >
              <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-4 w-4" />
                </DropdownMenu.ItemIndicator>
              </span>
              {option.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
