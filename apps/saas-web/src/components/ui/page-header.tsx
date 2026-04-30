'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from './button'
import type { ButtonProps } from './button'
import { cn } from '@/lib/utils'

export interface PageHeaderAction {
  label: string
  onClick?: () => void
  href?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  icon?: React.ComponentType<{ className?: string }>
  disabled?: boolean
}

export interface PageHeaderProps {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  onBack?: () => void
  actions?: PageHeaderAction[]
  className?: string
  sticky?: boolean
}

export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  onBack,
  actions = [],
  className,
  sticky = true,
}: PageHeaderProps) {
  const showBack = Boolean(backHref || onBack)

  return (
    <div
      style={sticky ? { top: 'var(--app-header-height, 0px)' } : undefined}
      className={cn(
        "z-20 border-b bg-white",
        sticky && "sticky",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          {showBack ? (
            backHref ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-2 mb-1 h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <Link href={backHref}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {backLabel}
                </Link>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="-ml-2 mb-1 h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {backLabel}
              </Button>
            )
          ) : null}
          <h1 className="text-[var(--font-size-xl)] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 text-[var(--font-size-sm)] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions.map((action, index) => {
              const variant = action.variant ?? "outline"
              const buttonContent = (
                <>
                  {action.icon ? <action.icon className="h-4 w-4" /> : null}
                  {action.label}
                </>
              )

              if (action.href) {
                return (
                  <Button
                    key={`${action.label}-${index}`}
                    variant={variant}
                    size={action.size ?? "default"}
                    className="gap-2"
                    disabled={action.disabled}
                    asChild
                  >
                    <Link href={action.href}>{buttonContent}</Link>
                  </Button>
                )
              }

              return (
                <Button
                  key={`${action.label}-${index}`}
                  variant={variant}
                  size={action.size ?? "default"}
                  onClick={action.onClick}
                  className="gap-2"
                  disabled={action.disabled || (!action.onClick && !action.href)}
                >
                  {buttonContent}
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
