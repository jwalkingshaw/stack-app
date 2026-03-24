'use client';

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

export interface SettingsActionsDropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface SettingsActionsDropdownProps {
  items: SettingsActionsDropdownItem[];
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SettingsActionsDropdown({
  items,
  label = 'Actions',
  disabled = false,
  className,
}: SettingsActionsDropdownProps) {
  const hasItems = items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', className)}
          disabled={disabled || !hasItems}
          aria-label={label}
        >
          <MoreVertical className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled}
              onSelect={(event) => {
                event.preventDefault();
                if (item.disabled) return;
                item.onSelect();
              }}
              className={
                item.destructive
                  ? 'cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive'
                  : 'cursor-pointer'
              }
            >
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
