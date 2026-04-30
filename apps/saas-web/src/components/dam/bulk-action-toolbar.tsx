"use client";

import { Edit, Languages, Trash2, X, LayersIcon, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BulkActionToolbarProps {
  selectedCount: number;
  /** Open the "Add to set" dialog */
  onAddToSet: () => void;
  /** Remove selected items from the active set filter. Only shown when provided. */
  onRemoveFromSet?: () => void;
  /** Display name of the currently active set filter */
  activeSetName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** When provided, a Translate button is shown. */
  onTranslate?: () => void;
  className?: string;
}

export function BulkActionToolbar({
  selectedCount,
  onAddToSet,
  onRemoveFromSet,
  activeSetName,
  onEdit,
  onDelete,
  onClear,
  onTranslate,
  className,
}: BulkActionToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "bg-white border border-border rounded-xl shadow-lg",
        "animate-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      <div className="flex items-center gap-1 px-4 py-3">

        {/* Count */}
        <div className="flex items-center pr-3 border-r border-border">
          <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
            {selectedCount} selected
          </span>
        </div>

        {/* Set actions */}
        <div className="flex items-center gap-1 pr-3 border-r border-border">
          <Button
            size="sm"
            variant="ghost"
            onClick={onAddToSet}
            className="h-8 px-3 hover:bg-[var(--color-secondary-button-hover)]"
            title="Add to set"
          >
            <LayersIcon className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Add to set</span>
          </Button>

          {onRemoveFromSet && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemoveFromSet}
              className="h-8 px-3 hover:bg-[var(--color-secondary-button-hover)]"
              title={activeSetName ? `Remove from "${activeSetName}"` : "Remove from set"}
            >
              <MinusCircle className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 max-w-[160px] truncate">
                {activeSetName ? `Remove from "${activeSetName}"` : "Remove from set"}
              </span>
            </Button>
          )}
        </div>

        {/* Edit / workflow actions */}
        <div className="flex items-center gap-1 pr-3 border-r border-border">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="h-8 px-3 hover:bg-[var(--color-secondary-button-hover)]"
            title="Bulk edit fields"
          >
            <Edit className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Edit</span>
          </Button>

          {onTranslate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onTranslate}
              className="h-8 px-3 hover:bg-[var(--color-secondary-button-hover)]"
              title="Translate"
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Translate</span>
            </Button>
          )}
        </div>

        {/* Destructive + close */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-8 px-3 hover:bg-[var(--color-secondary-button-hover)]"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Delete</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-8 px-2 hover:bg-[var(--color-secondary-button-hover)]"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

      </div>
    </div>
  );
}
