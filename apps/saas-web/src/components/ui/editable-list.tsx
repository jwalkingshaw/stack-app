'use client';

import { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EditableListBulkAction {
  label: string;
  onClick: (selectedIds: string[]) => void | Promise<void>;
  destructive?: boolean;
}

export interface EditableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string | null | undefined;

  // Optional toggle per row (required / active / enabled)
  getToggled?: (item: T) => boolean;
  onToggle?: (id: string, next: boolean) => void | Promise<void>;

  // Click label to rename inline
  onRename?: (id: string, newLabel: string) => void | Promise<void>;

  // Row actions
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;

  // Bulk selection + actions (shown when 1+ rows selected)
  bulkActions?: EditableListBulkAction[];

  // Expanded inline panel (e.g. InlineMappingEditor)
  expandedId?: string | null;
  renderExpanded?: (item: T) => React.ReactNode;

  // Header
  headerLabel?: string;        // e.g. "3 attributes"
  headerAction?: React.ReactNode; // e.g. "+ Add attributes" button

  // Panel that renders between header and rows (e.g. a field picker)
  headerPanel?: React.ReactNode;

  // Empty state
  emptyMessage?: string;

  className?: string;
}

export function EditableList<T>({
  items,
  getId,
  getLabel,
  getSublabel,
  getToggled,
  onToggle,
  onRename,
  onEdit,
  onDelete,
  bulkActions,
  expandedId,
  renderExpanded,
  headerLabel,
  headerAction,
  headerPanel,
  emptyMessage = 'No items yet.',
  className,
}: EditableListProps<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const allSelected = items.length > 0 && items.every((item) => selected.has(getId(item)));
  const someSelected = items.some((item) => selected.has(getId(item)));
  const selectedCount = selected.size;
  const hasBulk = !!bulkActions?.length;
  const showToggleCol = !!getToggled;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map(getId)));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startRename = (item: T) => {
    setRenamingId(getId(item));
    setRenameValue(getLabel(item));
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed && onRename) await onRename(renamingId, trimmed);
    setRenamingId(null);
  };

  const handleToggle = async (id: string, next: boolean) => {
    if (!onToggle) return;
    setTogglingIds((prev) => new Set([...prev, id]));
    try { await onToggle(id, next); }
    finally {
      setTogglingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleBulkAction = async (action: EditableListBulkAction) => {
    await action.onClick(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-gray-200', className)}>
      {/* ── Header ── */}
      <div className="flex min-h-[48px] items-center justify-between border-b border-gray-200 px-4 py-3">
        {someSelected && hasBulk ? (
          // Bulk action bar
          <>
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-muted-foreground">{selectedCount} selected</span>
              {bulkActions!.map((action) => (
                <button
                  key={action.label}
                  onClick={() => void handleBulkAction(action)}
                  className={cn(
                    'text-xs font-medium transition-colors',
                    action.destructive
                      ? 'text-destructive hover:text-destructive/80'
                      : 'text-foreground hover:text-muted-foreground'
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          </>
        ) : (
          // Normal header
          <>
            <div className="flex items-center gap-3">
              {hasBulk && (
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                  aria-label="Select all"
                />
              )}
              {headerLabel && (
                <span className="text-xs font-medium text-muted-foreground">{headerLabel}</span>
              )}
            </div>
            {headerAction && <div className="flex items-center">{headerAction}</div>}
          </>
        )}
      </div>

      {/* ── Header panel (e.g. field picker) ── */}
      {headerPanel}

      {/* ── Rows ── */}
      {items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div>
          {items.map((item, index) => {
            const id = getId(item);
            const label = getLabel(item);
            const sublabel = getSublabel?.(item);
            const toggled = getToggled?.(item) ?? false;
            const isExpanded = expandedId === id;
            const isRenaming = renamingId === id;
            const isToggling = togglingIds.has(id);

            return (
              <div key={id}>
                <div className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                  {index > 0 && <div className="absolute left-4 right-4 top-0 h-px bg-gray-200" />}

                  {/* Checkbox */}
                  {hasBulk && (
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleSelect(id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                    />
                  )}

                  {/* Toggle (required / active) */}
                  {showToggleCol && (
                    <Switch
                      checked={toggled}
                      onCheckedChange={(next) => void handleToggle(id, next)}
                      disabled={isToggling}
                      className="shrink-0"
                    />
                  )}

                  {/* Label + sublabel */}
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        ref={inputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                    ) : (
                      <div
                        className={cn(
                          'text-sm font-medium text-foreground',
                          onRename && 'cursor-text hover:underline decoration-muted-foreground/40 underline-offset-2'
                        )}
                        onClick={() => onRename && startRename(item)}
                        title={onRename ? 'Click to rename' : undefined}
                      >
                        {label}
                      </div>
                    )}
                    {sublabel && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
                    )}
                  </div>

                  {/* Row actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {onEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onEdit(id)}
                      >
                        {isExpanded ? 'Close' : 'Edit'}
                      </Button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(id)}
                        className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                        aria-label={`Delete ${label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && renderExpanded && (
                  <div>{renderExpanded(item)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
