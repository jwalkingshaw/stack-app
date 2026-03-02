'use client';

import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductField } from './DynamicFieldRenderer';
import { AssetPickerDialog, AssetSummary, MimeGroup } from './AssetPickerDialog';
import { Badge } from '@/components/ui/badge';

export interface FileAttributeValue {
  assetId: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

interface FileFieldComponentProps {
  field: ProductField;
  value?: FileAttributeValue | FileAttributeValue[] | null;
  onChange?: (value: FileAttributeValue | FileAttributeValue[] | null) => void;
  tenantSlug?: string;
  disabled?: boolean;
  className?: string;
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, order)).toFixed(order === 0 ? 0 : 1)} ${units[order]}`;
};

const normalizeAllowedGroups = (groups?: string[]): MimeGroup[] | undefined => {
  if (!groups || groups.length === 0) return undefined;
  return groups.filter(
    (group): group is MimeGroup =>
      ['image', 'document', 'spreadsheet', 'presentation', 'pdf', 'video', 'audio', 'svg', 'tiff', 'other'].includes(group)
  );
};

const toValue = (asset: AssetSummary): FileAttributeValue => ({
  assetId: asset.id,
  filename: asset.originalFilename ?? asset.fileName ?? 'Asset',
  mimeType: asset.mimeType,
  size: asset.fileSize,
  url: asset.previewUrl ?? asset.thumbnailUrls?.large ?? asset.thumbnailUrls?.medium ?? asset.s3Url,
  uploadedAt: asset.createdAt,
  metadata: {
    width: asset.width,
    height: asset.height,
    tags: asset.tags,
  },
});

export function FileFieldComponent({
  field,
  value,
  onChange,
  tenantSlug,
  disabled = false,
  className = '',
}: FileFieldComponentProps) {
  const allowMultiple = !!field.options?.allow_multiple;
  const fileValues: FileAttributeValue[] = useMemo(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (selection: AssetSummary | AssetSummary[]) => {
    const assets = Array.isArray(selection) ? selection : [selection];
    const normalized = assets.map(toValue);
    if (allowMultiple) {
      const merged = [...fileValues, ...normalized].reduce<FileAttributeValue[]>((acc, item) => {
        if (acc.some((existing) => existing.assetId === item.assetId)) return acc;
        acc.push(item);
        return acc;
      }, []);
      onChange?.(merged);
    } else {
      onChange?.(normalized[0]);
    }
  };

  const handleRemove = (assetId: string) => {
    if (allowMultiple) {
      const filtered = fileValues.filter((item) => item.assetId !== assetId);
      onChange?.(filtered.length > 0 ? filtered : null);
    } else {
      onChange?.(null);
    }
  };

  const allowedGroups = normalizeAllowedGroups(field.options?.allowed_mime_groups);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={disabled || !tenantSlug}
        >
          <Plus className="mr-1 h-4 w-4" />
          {allowMultiple ? 'Add files' : fileValues.length > 0 ? 'Replace file' : 'Select file'}
        </Button>
        {allowMultiple && fileValues.length > 0 && (
          <Badge variant="secondary" className="self-center">
            {fileValues.length} attached
          </Badge>
        )}
        {!tenantSlug && (
          <span className="text-xs text-muted-foreground">
            Tenant context required to browse assets.
          </span>
        )}
      </div>

      {fileValues.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
          No file attached yet. Select an existing DAM asset. The field stores the asset ID reference.
        </div>
      )}

      {fileValues.length > 0 && (
        <div className="space-y-2">
          {fileValues.map((file) => (
            <div
              key={file.assetId}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">{file.filename}</div>
                  <div className="text-xs text-muted-foreground">{file.mimeType} | {formatFileSize(file.size)}</div>
                  <div className="text-[11px] text-muted-foreground">Asset ID: {file.assetId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {file.url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(file.assetId)}
                  disabled={disabled}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tenantSlug={tenantSlug ?? ''}
        allowedMimeGroups={allowedGroups}
        multiple={allowMultiple}
        onSelect={handleSelect}
      />
    </div>
  );
}
