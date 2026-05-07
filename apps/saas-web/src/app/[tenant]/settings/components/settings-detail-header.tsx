'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SettingsDetailHeaderMeta {
  label: string;
  mono?: boolean;
}

export interface SettingsDetailHeaderProps {
  // Back navigation
  backHref: string;
  backLabel: string;

  // Title — editable if onRename is provided
  title: string;
  onRename?: (newTitle: string) => void | Promise<void>;

  // Description — editable if onEditDescription is provided
  description?: string | null;
  onEditDescription?: (newDescription: string) => void | Promise<void>;
  descriptionPlaceholder?: string;

  // Metadata chips rendered below the title (type, code, market, etc.)
  meta?: SettingsDetailHeaderMeta[];

  // Right-side slot: active toggle, delete button, badges, etc.
  actions?: React.ReactNode;
}

export function SettingsDetailHeader({
  backHref,
  backLabel,
  title,
  onRename,
  description,
  onEditDescription,
  descriptionPlaceholder = 'Add a description...',
  meta,
  actions,
}: SettingsDetailHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  const startEditTitle = () => {
    if (!onRename) return;
    setTitleValue(title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  };

  const commitTitle = async () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== title && onRename) await onRename(trimmed);
    setEditingTitle(false);
  };

  const startEditDescription = () => {
    if (!onEditDescription) return;
    setDescriptionValue(description ?? '');
    setEditingDescription(true);
    setTimeout(() => descInputRef.current?.select(), 0);
  };

  const commitDescription = async () => {
    if (onEditDescription) await onEditDescription(descriptionValue.trim());
    setEditingDescription(false);
  };

  const hasDescription = onEditDescription !== undefined || description;

  return (
    <div>
      {/* Back link */}
      <Link
        href={backHref}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>{backLabel}</span>
      </Link>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">

          {/* Title */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="w-full rounded border border-border bg-background px-2 py-0.5 text-2xl font-semibold text-foreground outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          ) : (
            <h2
              className={cn(
                'text-2xl font-semibold text-foreground',
                onRename && 'cursor-text underline-offset-2 decoration-muted-foreground/40 hover:underline'
              )}
              onClick={startEditTitle}
              title={onRename ? 'Click to rename' : undefined}
            >
              {title}
            </h2>
          )}

          {/* Meta chips */}
          {meta && meta.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {meta.map((chip, i) => (
                <span key={i} className="flex items-center gap-x-2">
                  {i > 0 && <span className="text-muted-foreground/40">·</span>}
                  <span className={cn(chip.mono && 'font-mono')}>{chip.label}</span>
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {hasDescription && (
            <div className="mt-3">
              {editingDescription ? (
                <input
                  ref={descInputRef}
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  onBlur={() => void commitDescription()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitDescription();
                    if (e.key === 'Escape') setEditingDescription(false);
                  }}
                  placeholder={descriptionPlaceholder}
                  className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              ) : (
                <p
                  className={cn(
                    'text-sm',
                    description ? 'text-muted-foreground' : 'italic text-muted-foreground/40',
                    onEditDescription && 'cursor-text underline-offset-2 decoration-muted-foreground/40 hover:underline'
                  )}
                  onClick={startEditDescription}
                  title={onEditDescription ? 'Click to edit description' : undefined}
                >
                  {description || descriptionPlaceholder}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right-side actions */}
        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
