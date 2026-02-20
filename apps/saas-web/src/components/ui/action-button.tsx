import React from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent-blue' | 'secondary' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

/**
 * Consistent action button used throughout the SAAS app
 * Provides unified styling and behavior for all primary actions
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({
    className,
    variant = 'default',
    size = 'default',
    loading = false,
    icon: Icon,
    children,
    disabled,
    ...props
  }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn("font-medium", className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {typeof children === 'string' ?
              (children.includes('...') ? children : `${children}...`) :
              children
            }
          </>
        ) : (
          <>
            {Icon && <Icon className="w-4 h-4 mr-2" />}
            {children}
          </>
        )}
      </Button>
    );
  }
);

ActionButton.displayName = "ActionButton";