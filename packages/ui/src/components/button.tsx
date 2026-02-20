'use client';

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:pointer-events-none disabled:opacity-50 disabled:bg-muted/30 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[1px] border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] text-white hover:text-white active:text-white hover:border-[var(--color-accent-blue-hover)] hover:bg-[var(--color-accent-blue-hover)] active:border-[var(--color-accent-blue-active)] active:bg-[var(--color-accent-blue-active)] shadow-soft",
        "accent-blue": "border-[1px] border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] text-white hover:text-white active:text-white hover:border-[var(--color-accent-blue-hover)] hover:bg-[var(--color-accent-blue-hover)] active:border-[var(--color-accent-blue-active)] active:bg-[var(--color-accent-blue-active)] shadow-soft",
        destructive:
          "border-[1px] border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 shadow-soft",
        outline:
          "border-[1px] border-[var(--color-border)] bg-transparent text-foreground hover:border-[var(--color-border-hover)] hover:bg-[var(--color-interactive-hover)] active:bg-[var(--color-interactive-pressed)] shadow-soft",
        secondary:
          "border-[1px] border-[var(--color-border-strong)] bg-transparent text-foreground hover:border-[var(--color-foreground-muted)] hover:bg-[var(--color-interactive-hover)] active:bg-[var(--color-interactive-pressed)] shadow-soft",
        ghost: "border-[1px] border-transparent hover:bg-[var(--color-interactive-hover)] hover:text-foreground active:bg-[var(--color-interactive-pressed)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-2",
        sm: "h-6 px-3 py-2",
        lg: "h-10 px-4 py-3",
        icon: "h-8 w-8",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const resolvedVariant = variant ?? "default"
    const forceWhiteText =
      resolvedVariant === "default" || resolvedVariant === "accent-blue"

    const resolvedStyle = forceWhiteText
      ? { ...(style || {}), color: "var(--color-primary-foreground)" }
      : style

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={resolvedStyle}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
