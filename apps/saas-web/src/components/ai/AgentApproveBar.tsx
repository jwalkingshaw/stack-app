'use client';

import React from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SheetFooter } from '@/components/ui/sheet';

interface AgentApproveBarProps {
  totalChanges: number;
  selectedCount: number;
  pendingCount: number;
  isCommitting: boolean;
  onApproveSelected: () => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
}

export function AgentApproveBar({
  totalChanges,
  selectedCount,
  pendingCount,
  isCommitting,
  onApproveSelected,
  onApproveAll,
  onRejectAll,
}: AgentApproveBarProps) {
  const hasSelection = selectedCount > 0 && selectedCount < pendingCount;

  return (
    <SheetFooter>
      <div className="flex w-full items-center justify-between gap-3">
        <Button
          variant="outline"
          size="default"
          onClick={onRejectAll}
          disabled={isCommitting || pendingCount === 0}
          className="gap-1.5 text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
          Reject all
        </Button>

        <div className="flex items-center gap-2">
          {hasSelection && (
            <Button
              variant="outline"
              size="default"
              onClick={onApproveSelected}
              disabled={isCommitting}
              className="gap-1.5"
            >
              {isCommitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Apply selected ({selectedCount})
            </Button>
          )}

          <Button
            size="default"
            onClick={onApproveAll}
            disabled={isCommitting || pendingCount === 0}
            className="gap-1.5"
          >
            {isCommitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {hasSelection ? `Apply all (${pendingCount})` : `Apply ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </SheetFooter>
  );
}
