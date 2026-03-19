'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SimpleRichTextEditor } from '@/components/ui/simple-rich-text-editor';
import {
  CanonicalTextAreaFieldOptions,
  normalizeTextAreaFieldOptions,
} from './field-option-schema';

type TextAreaFieldOptions = CanonicalTextAreaFieldOptions;

interface TextAreaFieldProps {
  value?: Partial<TextAreaFieldOptions> | Record<string, unknown>;
  onChange: (options: TextAreaFieldOptions) => void;
}

export default function TextAreaField({ value, onChange }: TextAreaFieldProps) {
  const [options, setOptions] = useState<TextAreaFieldOptions>(() => normalizeTextAreaFieldOptions(value));
  const previewRichTextValue = '<p><strong>Example</strong> rich text content.</p><p>Add links, lists, and formatting.</p>';

  useEffect(() => {
    setOptions(normalizeTextAreaFieldOptions(value));
  }, [value]);

  const updateOption = (
    key: keyof TextAreaFieldOptions,
    val: TextAreaFieldOptions[keyof TextAreaFieldOptions]
  ) => {
    const next = { ...options, [key]: val };
    setOptions(next);
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Multi-line text settings</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Configure plain or rich text mode, size, and character limits.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Editor mode</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={options.rich_text}
              onChange={(event) => updateOption('rich_text', event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm leading-6 text-foreground">Enable rich text editor</span>
          </label>
          {options.rich_text && (
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input
                type="checkbox"
                checked={options.strip_formatting_on_paste}
                onChange={(event) => updateOption('strip_formatting_on_paste', event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm leading-6 text-foreground">Strip formatting on paste</span>
            </label>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Rows</label>
            <Input
              type="number"
              min={2}
              max={20}
              value={options.rows}
              onChange={(event) => updateOption('rows', Math.max(2, Math.min(20, Number(event.target.value) || 4)))}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Min length</label>
            <Input
              type="number"
              min={0}
              value={options.min_length ?? ''}
              onChange={(event) =>
                updateOption('min_length', event.target.value === '' ? undefined : Number(event.target.value))
              }
              placeholder="Optional"
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Max length</label>
            <Input
              type="number"
              min={1}
              value={options.max_length ?? ''}
              onChange={(event) =>
                updateOption('max_length', event.target.value === '' ? undefined : Number(event.target.value))
              }
              placeholder="Optional"
              className="h-11"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={options.auto_resize}
            onChange={(event) => updateOption('auto_resize', event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm leading-6 text-foreground">Auto-resize while typing (plain text mode)</span>
        </label>

        <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          {options.rich_text ? (
            <div className="mt-3 space-y-2">
              <SimpleRichTextEditor
                value={previewRichTextValue}
                onChange={() => undefined}
                disabled
                minHeightClassName="min-h-[120px]"
                stripFormattingOnPaste={options.strip_formatting_on_paste}
              />
              <p className="text-xs text-muted-foreground">
                Paste behavior: {options.strip_formatting_on_paste ? 'Plain text only' : 'Keep formatting'}
              </p>
            </div>
          ) : (
            <textarea
              rows={Math.min(6, options.rows)}
              disabled
              placeholder="Enter multi-line content..."
              className="mt-3 w-full resize-none rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
            />
          )}
        </div>
      </div>
    </div>
  );
}
