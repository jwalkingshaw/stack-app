"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

type SwitchSize = "default" | "sm"

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  size?: SwitchSize
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size = "sm", ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-[1px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      size === "sm" ? "h-[18px] w-[34px]" : "h-[22px] w-[42px]",
      "data-[state=unchecked]:border-[var(--color-border-strong)] data-[state=unchecked]:bg-[var(--color-background-tertiary)] hover:data-[state=unchecked]:border-[var(--color-border-hover)] hover:data-[state=unchecked]:bg-[var(--color-interactive-hover)]",
      "data-[state=checked]:border-[var(--color-accent-blue)] data-[state=checked]:bg-[var(--color-accent-blue)] hover:data-[state=checked]:border-[var(--color-accent-blue-hover)] hover:data-[state=checked]:bg-[var(--color-accent-blue-hover)] data-[state=checked]:active:bg-[var(--color-accent-blue-active)] focus-visible:ring-[var(--color-accent-blue)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=unchecked]:translate-x-0",
        size === "sm"
          ? "h-[14px] w-[14px] data-[state=checked]:translate-x-[16px]"
          : "h-[18px] w-[18px] data-[state=checked]:translate-x-5"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
