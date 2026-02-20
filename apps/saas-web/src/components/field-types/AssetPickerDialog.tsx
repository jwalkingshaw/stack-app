'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Search, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface AssetSummary {
  id: string;
  originalFilename: string;
  fileName?: string;
  mimeType: string;
  fileSize: number;
  thumbnailUrls?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  previewUrl?: string;
  s3Url?: string;
  createdAt?: string;
  width?: number;
  height?: number;
  tags?: string[];
}

export type MimeGroup =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'svg'
  | 'tiff'
  | 'other';

interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  allowedMimeGroups?: MimeGroup[];
  multiple?: boolean;
  onSelect: (assets: AssetSummary[] | AssetSummary) => void;
}

const MIME_GROUP_MAP: Record<MimeGroup, RegExp> = {
  image: /^image\//i,
  document: /(word|text|ms-?word|application\/pdf)/i,
  spreadsheet: /(spreadsheet|excel|sheet)/i,
  presentation: /(presentation|powerpoint|ppt)/i,
  pdf: /pdf/i,
  video: /^video\//i,
  audio: /^audio\//i,
  svg: /svg/i,
  tiff: /tiff/i,
  other: /.*/,
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, order)).toFixed(order === 0 ? 0 : 1)} ${units[order]}`;
};

const matchesAllowedMime = (mimeType: string, allowedGroups?: MimeGroup[]) => {
  if (!allowedGroups || allowedGroups.length === 0) return true;
  return allowedGroups.some((group) => MIME_GROUP_MAP[group].test(mimeType));
};

export function AssetPickerDialog({
  open,
  onOpenChange,
  tenantSlug,
  allowedMimeGroups,
  multiple = false,
  onSelect,
}: AssetPickerDialogProps) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 60;

  useEffect(() => {
    if (!open) {
      setSearchInput('');
      setSearch('');
      setAssets([]);
      setPage(0);
      setHasMore(false);
      setSelectedIds(new Set());
      return;
    }

    if (!tenantSlug) {
      return;
    }

    const debounce = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
      setAssets([]);
      setHasMore(false);
    }, 300);

    return () => clearTimeout(debounce);
  }, [open, searchInput, tenantSlug]);

  useEffect(() => {
    if (!open) return;
    if (!tenantSlug) return;

    const fetchAssets = async () => {
      try {
        const isInitial = page === 0;
        if (isInitial) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
        const offset = page * limit;
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (search) {
          params.set('q', search);
        }
        const response = await fetch(`/api/${tenantSlug}/assets?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to load assets (${response.status})`);
        }
        const payload = await response.json();
        const list: AssetSummary[] = payload?.data?.assets ?? [];
        setAssets((prev) => (isInitial ? list : [...prev, ...list]));
        const pagination = payload?.data?.pagination;
        setHasMore(Boolean(pagination?.hasMore));
      } catch (err: any) {
        console.error('Failed to fetch assets', err);
        setError(err.message ?? 'Failed to fetch assets');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    fetchAssets();
  }, [open, tenantSlug, search, page]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => matchesAllowedMime(asset.mimeType, allowedMimeGroups));
  }, [assets, allowedMimeGroups]);

  const handleToggle = (assetId: string) => {
    setSelectedIds((prev) => {
      if (!multiple) {
        return new Set([assetId]);
      }
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selections = assets.filter((asset) => selectedIds.has(asset.id));
    if (!multiple) {
      onSelect(selections[0]);
    } else {
      onSelect(selections);
    }
    onOpenChange(false);
  };

  const isSelected = (id: string) => selectedIds.has(id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select Asset</DialogTitle>
          <DialogDescription>
            Browse the asset library and attach existing files. Uploads are managed separately from the Assets workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets by name or tag"
              className="pl-9"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading assets…
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-center text-sm text-muted-foreground">
              No assets match your filters. Try adjusting search or upload new assets.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredAssets.map((asset) => {
                const selected = isSelected(asset.id);
                const isImage = asset.mimeType?.startsWith('image/');
                const preview =
                  asset.thumbnailUrls?.medium || asset.thumbnailUrls?.small || asset.previewUrl || asset.s3Url;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleToggle(asset.id)}
                    className={[
                      'flex flex-col gap-2 rounded-lg border p-3 text-left transition',
                      selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40',
                    ].join(' ')}
                  >
                    <div className="flex h-32 items-center justify-center rounded-md bg-muted">
                      {isImage && preview ? (
                        <Image
                          src={preview}
                          alt={asset.originalFilename ?? asset.fileName ?? 'Asset'}
                          width={200}
                          height={200}
                          className="h-full w-full rounded-md object-cover"
                        />
                      ) : (
                        <FileText className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="line-clamp-1 text-sm font-medium">
                        {asset.originalFilename ?? asset.fileName ?? 'Untitled asset'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {asset.mimeType || 'Unknown type'} • {formatFileSize(asset.fileSize)}
                      </div>
                      {asset.tags && asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {asset.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                              {tag}
                            </span>
                          ))}
                          {asset.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{asset.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {hasMore && !loading && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more...' : 'Load more'}
              </Button>
            </div>
          )}

          <div className="flex justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {selectedIds.size} asset{selectedIds.size === 1 ? '' : 's'} selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={selectedIds.size === 0} onClick={handleConfirm}>
                {multiple ? 'Use Selected Assets' : 'Use Asset'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
