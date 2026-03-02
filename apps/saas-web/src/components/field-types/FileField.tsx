'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Check, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface FileFieldOptions {
  allowed_mime_groups?: string[];
  allow_multiple?: boolean;
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
};

const initialise = (input?: FileFieldOptions): FileFieldState => ({
  allowedMimeGroups: input?.allowed_mime_groups?.length
    ? [...input.allowed_mime_groups]
    : ['pdf', 'document', 'image'],
  allowMultiple: !!input?.allow_multiple
});

const buildOptions = (state: FileFieldState): FileFieldOptions => ({
  allowed_mime_groups: state.allowedMimeGroups,
  allow_multiple: state.allowMultiple
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

  const { allowedMimeGroups, allowMultiple } = state;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Asset link rules</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            This field stores references to existing DAM assets. Links are keyed by asset ID, not filename.
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
            Users can only attach assets that match these file groups.
          </p>
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
            Enable for attributes that capture several documents, such as COAs and legal files.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 px-5 py-4 text-xs text-muted-foreground">
          <p className="mb-2 text-sm font-semibold text-foreground">How linking works</p>
          <ul className="space-y-1">
            <li>- The saved reference is the DAM asset ID.</li>
            <li>- Filename is display metadata and can change without breaking links.</li>
            <li>- Upload and file governance remains managed in the Assets workspace.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
