'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Check, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface FileFieldOptions {
  allowed_mime_groups?: string[];
  max_size_mb?: number;
  allow_multiple?: boolean;
  require_download_security?: boolean;
}

interface FileFieldProps {
  value?: FileFieldOptions;
  onChange?: (value: FileFieldOptions) => void;
}

const MIME_GROUPS = [
  { id: 'image', label: 'Images (PNG, JPG, GIF, WEBP)' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'document', label: 'Documents (DOCX, TXT)' },
  { id: 'spreadsheet', label: 'Spreadsheets (XLSX, CSV)' },
  { id: 'presentation', label: 'Presentations (PPTX)' },
  { id: 'audio', label: 'Audio files' },
  { id: 'video', label: 'Video files' },
  { id: 'svg', label: 'Vector (SVG)' },
  { id: 'tiff', label: 'High fidelity (TIFF)' },
  { id: 'other', label: 'Other types' }
];

type FileFieldState = {
  allowedMimeGroups: string[];
  allowMultiple: boolean;
  requireSecurity: boolean;
  maxSize: string;
};

const initialise = (input?: FileFieldOptions): FileFieldState => ({
  allowedMimeGroups: input?.allowed_mime_groups?.length
    ? [...input.allowed_mime_groups]
    : ['pdf', 'document', 'image'],
  allowMultiple: !!input?.allow_multiple,
  requireSecurity: !!input?.require_download_security,
  maxSize: input?.max_size_mb !== undefined && input.max_size_mb !== null ? String(input.max_size_mb) : ''
});

const buildOptions = (state: FileFieldState): FileFieldOptions => ({
  allowed_mime_groups: state.allowedMimeGroups,
  allow_multiple: state.allowMultiple,
  require_download_security: state.requireSecurity,
  max_size_mb: state.maxSize === '' ? undefined : Number(state.maxSize)
});

export default function FileField({ value, onChange }: FileFieldProps) {
  const [state, setState] = useState<FileFieldState>(() => initialise(value));

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emit = (nextState: FileFieldState) => {
    onChangeRef.current?.(buildOptions(nextState));
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

  const updateState = (updater: (prev: FileFieldState) => FileFieldState) => {
    setState((prev) => {
      const next = updater(prev);
      emit(next);
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    updateState((prev) => {
      const includes = prev.allowedMimeGroups.includes(groupId);
      return {
        ...prev,
        allowedMimeGroups: includes
          ? prev.allowedMimeGroups.filter((id) => id !== groupId)
          : [...prev.allowedMimeGroups, groupId]
      };
    });
  };

  const { allowedMimeGroups, allowMultiple, requireSecurity, maxSize } = state;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">File upload rules</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Limit accepted file types, size, and download behaviour for this attribute.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Allowed file types</label>
          <div className="flex flex-wrap gap-2">
            {MIME_GROUPS.map((group) => {
              const selected = allowedMimeGroups.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={[
                    'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                  ].join(' ')}
                >
                  {selected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                  {group.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Users can only attach assets that match these file groups. Adjustments can be made later in attribute
            settings.
          </p>
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
            <p className="text-xs text-muted-foreground">Leave blank for no limit. Files are stored in Supabase (S3).</p>
          </div>

          <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span>Allow multiple files</span>
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
              Enable for attributes that capture several documents, such as regulatory or compliance files.
            </p>
            <div className="flex items-center justify-between pt-1">
              <span>Require secure downloads</span>
              <Switch
                checked={requireSecurity}
                onCheckedChange={(checked) =>
                  updateState((prev) => ({
                    ...prev,
                    requireSecurity: checked
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, downloads are served via signed URLs to guard access.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 px-5 py-4 text-xs text-muted-foreground">
          <p className="mb-2 text-sm font-semibold text-foreground">Best practices</p>
          <ul className="space-y-1">
            <li>- Encourage consistent file naming so variants inherit the correct documents.</li>
            <li>- Keep key specs in lightweight PDFs to optimise download speed.</li>
            <li>- Combine with workflows to flag missing attachments across the catalogue.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
