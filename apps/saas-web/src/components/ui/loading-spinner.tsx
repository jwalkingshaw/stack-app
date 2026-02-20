import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'default' | 'white' | 'primary' | 'muted';
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
};

const colorClasses = {
  default: 'text-muted-foreground',
  white: 'text-white',
  primary: 'text-primary',
  muted: 'text-muted-foreground'
};

export function LoadingSpinner({
  size = 'md',
  className,
  color = 'default'
}: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

// Convenience component for inline loading with text
export function LoadingText({
  text = 'Loading...',
  spinnerSize = 'sm',
  className
}: {
  text?: string;
  spinnerSize?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LoadingSpinner size={spinnerSize} />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

// Convenience component for centered page loading
export function PageLoader({
  text = 'Loading...',
  size = 'lg',
  className
}: {
  text?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <LoadingSpinner size={size} />
      <p className="text-muted-foreground mt-4">{text}</p>
    </div>
  );
}