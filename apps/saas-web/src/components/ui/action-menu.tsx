'use client';

import { Fragment, ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tradetool/ui';

export interface ActionMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

export function ActionMenu({
  items,
  ariaLabel = 'Open actions',
  disabled = false,
  className,
  contentClassName,
}: ActionMenuProps) {
  const hasItems = items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          disabled={disabled || !hasItems}
          className={cn(
            'border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground',
            className
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('w-48', contentClassName)}>
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled}
              onSelect={() => {
                if (item.disabled) return;
                item.onSelect();
              }}
              className={
                item.destructive
                  ? 'cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive'
                  : 'cursor-pointer'
              }
            >
              {item.icon ? <span className="mr-1.5 inline-flex items-center">{item.icon}</span> : null}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
