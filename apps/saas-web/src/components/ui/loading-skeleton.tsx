import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSkeletonProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'default' | 'white' | 'primary' | 'muted';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12'
};

const colorClasses = {
  default: 'bg-muted-foreground/25',
  white: 'bg-white/80',
  primary: 'bg-primary/25',
  muted: 'bg-muted-foreground/15'
};

export function LoadingSkeleton({
  size = 'md',
  className,
  color = 'default'
}: LoadingSkeletonProps) {
  return (
    <span className="inline-flex items-center" role="status" aria-live="polite" aria-label="Loading">
      <Skeleton
        className={cn(
          'shrink-0 rounded-full',
          sizeClasses[size],
          colorClasses[color],
          className
        )}
      />
    </span>
  );
}

// Convenience component for inline loading with text
export function LoadingTextSkeleton({
  text = 'Loading...',
  skeletonSize = 'sm',
  className
}: {
  text?: string;
  skeletonSize?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)} role="status" aria-live="polite">
      <LoadingSkeleton size={skeletonSize} />
      <Skeleton className="h-4 w-24 max-w-full" />
      <span className="sr-only">{text}</span>
    </div>
  );
}

// Convenience component for centered page loading
export function PageSkeleton({
  text = 'Loading...',
  size = 'lg',
  className
}: {
  text?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const rowCountBySize = {
    sm: 3,
    md: 4,
    lg: 5,
    xl: 6
  };

  const rowCount = rowCountBySize[size];

  return (
    <div className={cn('w-full space-y-6 py-6', className)} role="status" aria-live="polite">
      <div className="space-y-3">
        <Skeleton className="h-8 w-48 max-w-[70%]" />
        <Skeleton className="h-4 w-64 max-w-[90%]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rowCount }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn('h-12', index % 2 === 0 ? 'w-full' : 'w-[92%]')}
          />
        ))}
      </div>
      <span className="sr-only">{text}</span>
    </div>
  );
}

