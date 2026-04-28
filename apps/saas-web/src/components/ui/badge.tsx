import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // Generic / backward-compat
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-gray-200 bg-gray-100 text-gray-600",
        destructive: "border-red-200 bg-red-50 text-red-700",
        outline: "border-border bg-transparent text-foreground",
        // Semantic — prefer these
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-700",
        error: "border-red-200 bg-red-50 text-red-700",
        info: "border-blue-200 bg-blue-50 text-blue-700",
        neutral: "border-gray-200 bg-gray-100 text-gray-600",
        purple: "border-purple-200 bg-purple-100 text-purple-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
