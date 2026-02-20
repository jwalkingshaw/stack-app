'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProductField } from './DynamicFieldRenderer';
import { AssetPickerDialog, AssetSummary, MimeGroup } from './AssetPickerDialog';

export interface ImageAttributeValue {
  assetId: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  width?: number;
  height?: number;
  altText?: string;
  focalPoint?: { x: number; y: number };
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

interface ImageFieldComponentProps {
  field: ProductField;
  value?: ImageAttributeValue | ImageAttributeValue[] | null;
  onChange?: (value: ImageAttributeValue | ImageAttributeValue[] | null) => void;
  tenantSlug?: string;
  disabled?: boolean;
  className?: string;
}

const normalizeAllowedGroups = (groups?: string[]): MimeGroup[] | undefined => {
  if (!groups || groups.length === 0) return ['image'];
  return groups.filter((group): group is MimeGroup =>
    ['image', 'document', 'spreadsheet', 'presentation', 'pdf', 'video', 'audio', 'svg', 'tiff', 'other'].includes(group)
  );
};

const toImageValue = (asset: AssetSummary): ImageAttributeValue => ({
  assetId: asset.id,
  filename: asset.originalFilename ?? asset.fileName ?? 'Image asset',
  mimeType: asset.mimeType,
  size: asset.fileSize,
  url: asset.thumbnailUrls?.large ?? asset.thumbnailUrls?.medium ?? asset.previewUrl ?? asset.s3Url,
  width: asset.width,
  height: asset.height,
  uploadedAt: asset.createdAt,
  metadata: {
    tags: asset.tags,
  },
});

export function ImageFieldComponent({
  field,
  value,
  onChange,
  tenantSlug,
  disabled = false,
  className = '',
}: ImageFieldComponentProps) {
  const allowMultiple = !!field.options?.allow_multiple;
  const requireAltText = field.options?.require_alt_text ?? true;
  const images = useMemo<ImageAttributeValue[]>(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const allowedGroups = normalizeAllowedGroups(field.options?.allowed_mime_groups);

  const upsert = (nextImages: ImageAttributeValue[]) => {
    if (allowMultiple) {
      onChange?.(nextImages.length > 0 ? nextImages : null);
    } else {
      onChange?.(nextImages[0] ?? null);
    }
  };

  const handleSelect = (selection: AssetSummary | AssetSummary[]) => {
    const selected = Array.isArray(selection) ? selection : [selection];
    const normalized = selected.map(toImageValue);
    if (allowMultiple) {
      const merged = [...images];
      normalized.forEach((item) => {
        const existingIndex = merged.findIndex((image) => image.assetId === item.assetId);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...item, altText: merged[existingIndex].altText };
        } else {
          merged.push(item);
        }
      });
      upsert(merged);
    } else {
      upsert([normalized[0]]);
    }
  };

  const handleRemove = (assetId: string) => {
    const remaining = images.filter((image) => image.assetId !== assetId);
    upsert(remaining);
  };

  const updateAltText = (assetId: string, altText: string) => {
    const updated = images.map((image) => (image.assetId === assetId ? { ...image, altText } : image));
    upsert(updated);
  };

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
          {images.length > 0 ? 'Replace image' : 'Select image'}
        </Button>
        {allowMultiple && images.length > 0 && (
          <Badge variant="secondary" className="self-center">
            {images.length} images
          </Badge>
        )}
        {!tenantSlug && (
          <span className="text-xs text-muted-foreground">Tenant context required to browse assets.</span>
        )}
      </div>

      {images.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
          No image attached yet. Choose from the asset library or upload from the Assets workspace.
        </div>
      )}

      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((imageValue) => (
            <div key={imageValue.assetId} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <div className="relative h-40 w-full overflow-hidden rounded-md bg-muted">
                {imageValue.url ? (
                  <Image
                    src={imageValue.url}
                    alt={imageValue.altText || imageValue.filename}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    No preview
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {imageValue.url && (
                    <Button variant="secondary" size="icon" className="h-8 w-8" asChild>
                      <a href={imageValue.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    onClick={() => handleRemove(imageValue.assetId)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">{imageValue.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {imageValue.mimeType} • {Math.round((imageValue.size ?? 0) / 1024)} KB
                  {imageValue.width && imageValue.height ? ` • ${imageValue.width}×${imageValue.height}px` : ''}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Alt text {requireAltText && <span className="text-destructive">*</span>}
                </label>
                <Input
                  value={imageValue.altText ?? ''}
                  onChange={(event) => updateAltText(imageValue.assetId, event.target.value)}
                  disabled={disabled}
                  placeholder="Describe the image for accessibility and retailers"
                />
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
