'use client';

import React, { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, Package, FileText, Globe, Upload, FolderPlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StagedChange, StagedChangeType } from '@/lib/claude-agent';

// ---------------------------------------------------------------------------
// Icons per change type
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<StagedChangeType, React.ElementType> = {
  content_update: FileText,
  translation: Globe,
  export: Upload,
  publish: Globe,
  create_family: FolderPlus,
  create_product: Package,
  create_variants: Plus,
};

const TYPE_LABEL: Record<StagedChangeType, string> = {
  content_update: 'Content update',
  translation: 'Translation',
  export: 'Export',
  publish: 'Publish',
  create_family: 'New family',
  create_product: 'New product',
  create_variants: 'New variant',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentChangeCardProps {
  change: StagedChange;
  index: number;
  total: number;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  /** When true, approve/reject buttons are hidden (bulk approval mode) */
  bulkMode?: boolean;
  /** Allow toggling selection for partial approval */
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentChangeCard({
  change,
  index,
  total,
  onApprove,
  onReject,
  bulkMode = false,
  selected,
  onToggleSelect,
}: AgentChangeCardProps) {
  const [expanded, setExpanded] = useState(true);
  const Icon = TYPE_ICON[change.type] ?? FileText;
  const label = TYPE_LABEL[change.type] ?? change.type;

  const isApproved = change.approved === true;
  const isRejected = change.approved === false;
  const isPending = change.approved === null;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white transition-all',
        isApproved && 'border-green-200 bg-green-50/40',
        isRejected && 'border-gray-200 bg-gray-50/40 opacity-60',
        isPending && selected && 'border-[var(--color-accent-black)] ring-1 ring-[var(--color-accent-black)]',
        isPending && !selected && 'border-[var(--color-border)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Selection checkbox in bulk mode */}
        {bulkMode && isPending && onToggleSelect && (
          <button
            type="button"
            onClick={() => onToggleSelect(change.id)}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              selected
                ? 'border-[var(--color-accent-black)] bg-[var(--color-accent-black)] text-white'
                : 'border-[var(--color-border)] bg-white',
            )}
            aria-label={selected ? 'Deselect change' : 'Select change'}
          >
            {selected && <Check className="h-3 w-3" />}
          </button>
        )}

        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-interactive-hover)]">
          <Icon className="h-3.5 w-3.5 text-[var(--color-foreground-muted)]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-foreground-muted)]">
              {label}
            </span>
            <span className="text-xs text-[var(--color-foreground-subtle)]">
              {index + 1} of {total}
            </span>
          </div>
          {change.productName && (
            <p className="truncate text-sm font-medium text-gray-900">{change.productName}</p>
          )}
        </div>

        {/* Status badge */}
        {isApproved && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <Check className="h-3 w-3" /> Applied
          </span>
        )}
        {isRejected && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Skipped
          </span>
        )}

        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-foreground-muted)] hover:bg-[var(--color-interactive-hover)]"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-3 space-y-3">
          {/* Content / translation diff */}
          {(change.type === 'content_update' || change.type === 'translation') && (
            <>
              {change.field && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-foreground-muted)]">Field:</span>
                  <code className="rounded bg-[var(--color-interactive-hover)] px-1.5 py-0.5 text-xs">
                    {change.field}
                  </code>
                  {change.locale && (
                    <code className="rounded bg-[var(--color-interactive-hover)] px-1.5 py-0.5 text-xs">
                      {change.locale}
                    </code>
                  )}
                </div>
              )}
              {change.before && (
                <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-red-600">Before</p>
                  <p className="text-sm text-red-900 leading-relaxed">{change.before}</p>
                </div>
              )}
              {change.after && (
                <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-green-600">After</p>
                  <p className="text-sm text-green-900 leading-relaxed">{change.after}</p>
                </div>
              )}
            </>
          )}

          {/* Export details */}
          {change.type === 'export' && change.metadata && (
            <div className="rounded-md bg-[var(--color-interactive-hover)] px-3 py-2 space-y-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{(change.metadata.product_ids as unknown[])?.length ?? 0} products</span>
                {' '}will be exported as{' '}
                <span className="font-medium uppercase">{String(change.metadata.format ?? 'CSV')}</span>
              </p>
            </div>
          )}

          {/* Publish details */}
          {change.type === 'publish' && change.metadata && (
            <div className="rounded-md bg-[var(--color-interactive-hover)] px-3 py-2 space-y-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{(change.metadata.product_ids as unknown[])?.length ?? 0} products</span>
                {' '}published to{' '}
                <span className="font-medium">{(change.metadata.partner_ids as unknown[])?.length ?? 0} partners</span>
              </p>
            </div>
          )}

          {/* Create family/product/variant details */}
          {(change.type === 'create_family' || change.type === 'create_product' || change.type === 'create_variants') &&
            change.metadata && (
              <div className="rounded-md bg-[var(--color-interactive-hover)] px-3 py-2 space-y-1">
                {Object.entries(change.metadata)
                  .filter(([k, v]) => v !== null && v !== undefined && k !== 'parent_name')
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="text-[var(--color-foreground-muted)] shrink-0 capitalize">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="text-gray-900 truncate">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

          {/* Rationale */}
          {change.rationale && (
            <p className="text-xs text-[var(--color-foreground-muted)] italic border-l-2 border-[var(--color-border)] pl-2">
              {change.rationale}
            </p>
          )}

          {/* Per-card approve/reject (non-bulk mode only, pending only) */}
          {!bulkMode && isPending && (onApprove || onReject) && (
            <div className="flex gap-2 pt-1">
              {onApprove && (
                <Button size="sm" onClick={() => onApprove(change.id)} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Apply this change
                </Button>
              )}
              {onReject && (
                <Button size="sm" variant="outline" onClick={() => onReject(change.id)} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Skip
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
