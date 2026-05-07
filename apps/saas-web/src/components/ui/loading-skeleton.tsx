import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContentContainer } from '@/components/ui/page-content-container';

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
  className,
  variant = 'default',
}: {
  text?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  variant?: 'default' | 'settings-page' | 'settings-detail' | 'product-detail' | 'variant-detail';
}) {
  const rowCountBySize = {
    sm: 3,
    md: 4,
    lg: 5,
    xl: 6
  };

  const rowCount = rowCountBySize[size];

  if (variant === 'settings-page') {
    return (
      <div role="status" aria-live="polite">
        <PageContentContainer
          mode="content"
          padding="page"
          className={cn('space-y-6', className)}
        >
          <div className="space-y-3">
            <Skeleton className="h-8 w-40 max-w-[60%]" />
            <Skeleton className="h-4 w-[32rem] max-w-[90%]" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-64 max-w-full rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="space-y-3">
              {Array.from({ length: Math.max(3, rowCount - 1) }).map((_, index) => (
                <Skeleton
                  key={index}
                  className={cn('h-14 rounded-lg', index === 0 ? 'w-full' : 'w-[96%]')}
                />
              ))}
            </div>
          </div>
        </PageContentContainer>
        <span className="sr-only">{text}</span>
      </div>
    );
  }

  if (variant === 'settings-detail') {
    return (
      <div role="status" aria-live="polite">
        <PageContentContainer
          mode="content"
          padding="page"
          className={cn('space-y-5', className)}
        >
          <Skeleton className="h-4 w-32 max-w-[50%]" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-56 max-w-[70%]" />
            <Skeleton className="h-4 w-[28rem] max-w-[85%]" />
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-[88%] rounded-md" />
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <div className="space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </PageContentContainer>
        <span className="sr-only">{text}</span>
      </div>
    );
  }

  if (variant === 'product-detail' || variant === 'variant-detail') {
    return (
      <div className={cn('h-full min-h-0 overflow-hidden bg-background', className)} role="status" aria-live="polite">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-border/60 bg-background px-6 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-56 max-w-[45%]" />
                <Skeleton className="h-4 w-40 max-w-[30%]" />
              </div>
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>
          <div className="border-b border-border/60 bg-background px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: variant === 'product-detail' ? 6 : 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PageContentContainer mode="form" padding="page" className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-7 w-52 max-w-[55%]" />
                <Skeleton className="h-4 w-72 max-w-[75%]" />
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-5">
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              </div>
            </PageContentContainer>
          </div>
        </div>
        <span className="sr-only">{text}</span>
      </div>
    );
  }

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

