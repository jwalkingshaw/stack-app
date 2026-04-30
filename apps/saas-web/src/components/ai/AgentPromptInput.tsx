'use client';

import React, { useRef, useEffect } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const EXAMPLE_PROMPTS = [
  'Find campaign images for a product',
  'Rewrite descriptions for a product family',
  'Translate product content to a new locale',
  'Export products from an attribute group to CSV',
  'Publish new products to all partners',
  'Create variants for an existing product',
];

interface AgentPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder?: string;
  showExamples?: boolean;
}

export function AgentPromptInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = 'Describe what you want to do…',
  showExamples = false,
}: AgentPromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  };

  return (
    <div className="space-y-3 px-4 pb-4 pt-2">
      {/* Example prompt chips */}
      {showExamples && !value && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onChange(prompt)}
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs text-[var(--color-foreground-muted)] transition-colors hover:border-[var(--color-accent-black)] hover:text-[var(--color-accent-black)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 focus-within:border-[var(--color-accent-black)] focus-within:ring-1 focus-within:ring-[var(--color-accent-black)] transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-gray-900 placeholder:text-[var(--color-foreground-subtle)] focus:outline-none disabled:opacity-50"
          style={{ minHeight: '24px', maxHeight: '160px' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !value.trim()}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all',
            value.trim() && !isLoading
              ? 'bg-[var(--color-accent-black)] text-white hover:bg-[var(--color-accent-black-hover)]'
              : 'bg-[var(--color-interactive-hover)] text-[var(--color-foreground-subtle)]',
          )}
          aria-label="Send"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <p className="text-center text-[10px] text-[var(--color-foreground-subtle)]">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
