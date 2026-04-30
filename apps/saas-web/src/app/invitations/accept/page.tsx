import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import InvitationAcceptClient from './InvitationAcceptClient';

export default function InvitationAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="bg-background rounded-lg p-8">
              <div className="flex flex-col items-center space-y-4" aria-hidden="true">
                <Skeleton className="h-16 w-16 rounded-full bg-primary/20" />
                <Skeleton className="h-7 w-44" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <InvitationAcceptClient />
    </Suspense>
  );
}
