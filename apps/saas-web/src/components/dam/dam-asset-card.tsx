"use client";

import React from "react";
import { ImageIcon, FileText, MoreHorizontal, Plus, History, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@stack-app/ui";

export interface DamAssetCardProps {
  assetId: string;
  filename: string;
  mimeType?: string;
  fileType?: string;
  previewUrl?: string | null;

  /** Shows "v3" badge bottom-left over image */
  versionNumber?: number | null;
  /** e.g. "Front Panel", "Label Digital" — shown bottom-right over image */
  slotLabel?: string | null;
  /** Amber "Inherited" badge — parent asset visible in variant context */
  isInherited?: boolean;
  /** Small SKU badge — identifies which variant this asset belongs to */
  variantLabel?: string | null;

  isSelected?: boolean;
  isSelectable?: boolean;
  onSelect?: (e: React.MouseEvent) => void;

  /** Opens the quick-view / detail panel */
  onClick?: () => void;
  onAddVersion?: () => void;
  onVersionHistory?: () => void;
  onUnlink?: () => void;
  /** Opens the full DAM asset page in a new tab */
  onOpenInAssets?: () => void;

  readOnly?: boolean;
}

function isImageType(mimeType?: string, fileType?: string): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  const ftype = (fileType ?? "").toLowerCase();
  return (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ftype)
  );
}

export function DamAssetCard({
  filename,
  mimeType,
  fileType,
  previewUrl,
  versionNumber,
  slotLabel,
  isInherited,
  variantLabel,
  isSelected,
  isSelectable,
  onSelect,
  onClick,
  onAddVersion,
  onVersionHistory,
  onUnlink,
  onOpenInAssets,
  readOnly,
}: DamAssetCardProps) {
  const isImage = isImageType(mimeType, fileType);
  const showVersionBadge = typeof versionNumber === "number" && versionNumber > 1;
  const hasActions = !readOnly && (onAddVersion || onVersionHistory || onUnlink || onOpenInAssets);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded border border-border bg-card cursor-pointer hover:bg-muted/20 transition-colors">

      {/* ── Preview area ── */}
      <div
        className={`relative aspect-square overflow-hidden bg-muted/20 ${onClick ? "cursor-pointer" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      >
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={filename}
            className="h-full w-full object-contain bg-white"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
            {isImage
              ? <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              : <FileText className="h-10 w-10 text-muted-foreground/30" />}
            <p className="text-[10px] text-muted-foreground/50">{fileType ?? "file"}</p>
          </div>
        )}

        {/* Checkbox overlay (top-left) */}
        {isSelectable && (
          <div
            className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onSelect?.(e); }}
          >
            <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
              isSelected
                ? "border-primary bg-primary"
                : "border-white/80 bg-black/20 backdrop-blur-sm"
            }`}>
              {isSelected && <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          </div>
        )}

        {/* Actions dropdown (top-right) */}
        {hasActions && (
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 bg-background/90 px-0 backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {onAddVersion && (
                  <DropdownMenuItem onSelect={onAddVersion}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add New Version
                  </DropdownMenuItem>
                )}
                {onVersionHistory && (
                  <DropdownMenuItem onSelect={onVersionHistory}>
                    <History className="mr-2 h-3.5 w-3.5" />
                    Version History
                  </DropdownMenuItem>
                )}
                {onOpenInAssets && (
                  <>
                    {(onAddVersion || onVersionHistory) && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={onOpenInAssets}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Open in Assets
                    </DropdownMenuItem>
                  </>
                )}
                {onUnlink && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onUnlink} className="text-destructive focus:text-destructive">
                      Unlink
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Bottom overlay: version badge (left) + slot label (right) */}
        {(showVersionBadge || slotLabel) && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-1.5">
            {showVersionBadge ? (
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-sm">
                v{versionNumber}
              </span>
            ) : <span />}
            {slotLabel && (
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {slotLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Info area ── */}
      <div className="p-4">
        <h3
          className="truncate text-sm font-semibold text-foreground"
          title={filename}
        >
          {filename}
        </h3>

        {/* Context badges */}
        {(isInherited || variantLabel) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {isInherited && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Inherited
              </span>
            )}
            {variantLabel && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                {variantLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
