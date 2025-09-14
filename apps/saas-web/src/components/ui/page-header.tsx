import React from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export interface PageHeaderAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'ghost'
  icon?: React.ComponentType<{ className?: string }>
}

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: PageHeaderAction[]
  className?: string
}

export function PageHeader({ title, actions = [], className }: PageHeaderProps) {
  return (
    <div className={cn("sticky top-0 z-10 bg-background border-b border-sidebar-border px-4 pt-1 pb-1", className)}>
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-[15px] font-medium text-foreground">{title}</h1>
        </div>
        
        {actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant="ghost"
                onClick={action.onClick}
                className="gap-2 text-foreground hover:!bg-[hsl(var(--primary))] hover:!text-white"
              >
                {action.icon && <action.icon className="w-4 h-4" />}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}