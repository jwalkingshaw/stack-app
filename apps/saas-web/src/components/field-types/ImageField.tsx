'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface ImageFieldOptions {
  allowed_mime_groups?: string[];
  max_size_mb?: number;
  require_alt_text?: boolean;
  allow_multiple?: boolean;
  aspect_ratio_hint?: string;
}

interface ImageFieldProps {
  value?: ImageFieldOptions;
  onChange?: (value: ImageFieldOptions) => void;
}

type ImageFieldState = {
  allowedMimeGroups: string[];
  maxSize: string;
  requireAltText: boolean;
  allowMultiple: boolean;
  aspectRatio: string;
  customRatio: string;
};

const IMAGE_MIME_GROUPS = [
  { id: 'image', label: 'Standard images (PNG, JPG, WEBP)' },
  { id: 'svg', label: 'Vector (SVG)' },
  { id: 'tiff', label: 'High fidelity (TIFF)' },
  { id: 'other', label: 'Other formats' }
];

const RATIO_PRESETS = [
  { id: '1:1', label: 'Square 1:1' },
  { id: '4:5', label: 'Portrait 4:5' },
  { id: '3:4', label: 'Portrait 3:4' },
  { id: '16:9', label: 'Landscape 16:9' },
  { id: 'custom', label: 'Custom' }
];

const initialise = (input?: ImageFieldOptions): ImageFieldState => {
  const aspectHint = input?.aspect_ratio_hint ?? '';
  const preset = aspectHint && RATIO_PRESETS.some((item) => item.id === aspectHint) ? aspectHint : aspectHint ? 'custom' : '';

  return {
    allowedMimeGroups: input?.allowed_mime_groups?.length ? [...input.allowed_mime_groups] : ['image'],
    maxSize: input?.max_size_mb !== undefined && input.max_size_mb !== null ? String(input.max_size_mb) : '',
    requireAltText: input?.require_alt_text ?? true,
    allowMultiple: input?.allow_multiple ?? false,
    aspectRatio: preset,
    customRatio: preset === 'custom' ? aspectHint : ''
  };
};

const buildOptions = (state: ImageFieldState): ImageFieldOptions => ({
  allowed_mime_groups: state.allowedMimeGroups,
  max_size_mb: state.maxSize === '' ? undefined : Number(state.maxSize),
  require_alt_text: state.requireAltText,
  allow_multiple: state.allowMultiple,
  aspect_ratio_hint: state.aspectRatio === 'custom' ? state.customRatio || undefined : state.aspectRatio || undefined
});

export default function ImageField({ value, onChange }: ImageFieldProps) {
  const [state, setState] = useState<ImageFieldState>(() => initialise(value));

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emit = (next: ImageFieldState) => {
    onChangeRef.current?.(buildOptions(next));
  };

  useEffect(() => {
    emit(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value) return;
    const incoming = initialise(value);
    if (JSON.stringify(buildOptions(state)) !== JSON.stringify(buildOptions(incoming))) {
      setState(incoming);
      emit(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateState = (updater: (prev: ImageFieldState) => ImageFieldState) => {
    setState((prev) => {
      const next = updater(prev);
      emit(next);
      return next;
    });
  };

  const { allowedMimeGroups, maxSize, requireAltText, allowMultiple, aspectRatio, customRatio } = state;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Image upload guidance</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Define acceptable formats, size limits, and helpful aspect ratio hints.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Allowed image types</label>
          <div className="flex flex-wrap gap-2">
            {IMAGE_MIME_GROUPS.map((group) => {
              const active = allowedMimeGroups.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() =>
                    updateState((prev) => ({
                      ...prev,
                      allowedMimeGroups: active
                        ? prev.allowedMimeGroups.filter((id) => id !== group.id)
                        : [...prev.allowedMimeGroups, group.id]
                    }))
                  }
                  className={[
                    'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition',
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                  ].join(' ')}
                >
                  {active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                  {group.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Maximum file size (MB)</label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Unlimited"
              value={maxSize}
              onChange={(event) =>
                updateState((prev) => ({
                  ...prev,
                  maxSize: event.target.value
                }))
              }
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Large hero imagery is supported via Supabase (S3). Consider optimised derivatives for channel exports.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span>Require alt text</span>
              <Switch
                checked={requireAltText}
                onCheckedChange={(checked) =>
                  updateState((prev) => ({
                    ...prev,
                    requireAltText: checked
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enforce accessibility and retailer requirements by capturing alt descriptions.
            </p>
            <div className="flex items-center justify-between pt-1">
              <span>Allow multiple images</span>
              <Switch
                checked={allowMultiple}
                onCheckedChange={(checked) =>
                  updateState((prev) => ({
                    ...prev,
                    allowMultiple: checked
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Useful for gallery-style attributes such as lifestyle imagery or packaging angles.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
          <label className="text-sm font-medium text-foreground">Aspect ratio guidance</label>
          <div className="mt-3 flex flex-wrap gap-2">
            {RATIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  updateState((prev) => ({
                    ...prev,
                    aspectRatio: preset.id,
                    customRatio: preset.id === 'custom' ? prev.customRatio : ''
                  }))
                }
                className={[
                  'rounded-full border px-3 py-1 text-xs transition',
                  aspectRatio === preset.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                ].join(' ')}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {aspectRatio === 'custom' && (
            <Input
              className="mt-3 h-11"
              placeholder="e.g. 5:4"
              value={customRatio}
              onChange={(event) =>
                updateState((prev) => ({
                  ...prev,
                  customRatio: event.target.value
                }))
              }
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Provide guidance to keep imagery consistent across product families and sales channels.
          </p>
        </div>
      </div>
    </div>
  );
}
