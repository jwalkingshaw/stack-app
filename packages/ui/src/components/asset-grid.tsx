'use client';

import React from 'react';
import { MoreHorizontal, Download, Trash2, Edit, Eye } from 'lucide-react';
import { Button } from './button';
import { formatFileSize, formatDate, getFileIcon } from '../lib/utils';
import type { DamAsset } from '@tradetool/types';

interface AssetGridProps {
  assets: DamAsset[];
  onAssetClick?: (asset: DamAsset) => void;
  onAssetEdit?: (asset: DamAsset) => void;
  onAssetDelete?: (asset: DamAsset) => void;
  onAssetDownload?: (asset: DamAsset) => void;
  loading?: boolean;
}

export function AssetGrid({
  assets,
  onAssetClick,
  onAssetEdit,
  onAssetDelete,
  onAssetDownload,
  loading = false,
}: AssetGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse shadow-soft" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-24 h-24 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-6 shadow-soft">
          <span className="text-4xl opacity-60">📁</span>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-3">No assets found</h3>
        <p className="text-muted-foreground text-base max-w-sm mx-auto leading-relaxed">Upload your first asset to get started with your digital asset library.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onClick={() => onAssetClick?.(asset)}
          onEdit={() => onAssetEdit?.(asset)}
          onDelete={() => onAssetDelete?.(asset)}
          onDownload={() => onAssetDownload?.(asset)}
        />
      ))}
    </div>
  );
}

interface AssetCardProps {
  asset: DamAsset;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
}

function AssetCard({ asset, onClick, onEdit, onDelete, onDownload }: AssetCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  return (
    <div
      className="group relative bg-card rounded-xl border border-border overflow-hidden hover:shadow-medium hover:-translate-y-1 transition-all duration-200 cursor-pointer ring-0 hover:ring-2 hover:ring-primary/10"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-muted/30 relative">
        {asset.fileType === 'image' && asset.thumbnailUrls?.medium ? (
          <img
            src={asset.thumbnailUrls.medium}
            alt={asset.originalFilename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl">{getFileIcon(asset.mimeType)}</span>
          </div>
        )}

        {/* Actions overlay */}
        {showActions && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center space-x-2 animate-fade-in">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
              className="animate-slide-up"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDownload?.();
              }}
              className="animate-slide-up"
              style={{animationDelay: '50ms'}}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
              className="animate-slide-up"
              style={{animationDelay: '100ms'}}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="animate-slide-up"
              style={{animationDelay: '150ms'}}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Asset info */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground truncate leading-tight" title={asset.originalFilename}>
          {asset.originalFilename}
        </h3>
        <p className="text-xs text-muted-foreground mt-2 font-medium">
          {formatFileSize(asset.fileSize)} • {formatDate(asset.createdAt)}
        </p>
        
        {/* Tags */}
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {asset.tags.slice(0, 2).map((tag, index) => (
              <span
                key={index}
                className="inline-flex px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full border border-primary/20"
              >
                {tag}
              </span>
            ))}
            {asset.tags.length > 2 && (
              <span className="inline-flex px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                +{asset.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}