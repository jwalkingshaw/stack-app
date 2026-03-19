"use client";

import { Edit, Languages, Tag, Trash2, FolderIcon, X, Share2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BulkActionToolbarProps {
  selectedCount: number;
  onEdit: () => void;
  onTag: () => void;
  onMove: () => void;
  onDelete: () => void;
  onShare: () => void;
  onClear: () => void;
  /** When provided, a Translate button is shown. Omit or pass undefined to hide it. */
  onTranslate?: () => void;
  /** When provided, an Add to Kit button is shown. */
  onAddToKit?: () => void;
  className?: string;
}

export function BulkActionToolbar({
  selectedCount,
  onEdit,
  onTag,
  onMove,
  onDelete,
  onShare,
  onClear,
  onTranslate,
  onAddToKit,
  className
}: BulkActionToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50",
        "bg-white border border-border rounded-xl shadow-lg",
        "animate-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      <div className="flex items-center gap-1 px-4 py-3">
        {/* Selection Count */}
        <div className="flex items-center gap-3 pr-3 border-r border-border">
          <span className="text-sm font-semibold text-gray-900">
            {selectedCount} selected
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="h-8 px-3 hover:bg-blue-50 hover:text-blue-600"
            title="Bulk edit properties"
          >
            <Edit className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Edit</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onTag}
            className="h-8 px-3 hover:bg-green-50 hover:text-green-600"
            title="Manage tags"
          >
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Tag</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onMove}
            className="h-8 px-3 hover:bg-purple-50 hover:text-purple-600"
            title="Move to folder"
          >
            <FolderIcon className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Move</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onShare}
            className="h-8 px-3 hover:bg-indigo-50 hover:text-indigo-600"
            title="Share assets"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Share</span>
          </Button>

          {onAddToKit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAddToKit}
              className="h-8 px-3 hover:bg-violet-50 hover:text-violet-600"
              title="Add to Kit"
            >
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Add to Kit</span>
            </Button>
          )}

          {onTranslate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onTranslate}
              className="h-8 px-3 hover:bg-violet-50 hover:text-violet-600"
              title="Translate selected products"
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Translate</span>
            </Button>
          )}

          {/* Separator */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-8 px-3 hover:bg-red-50 hover:text-red-600"
            title="Delete assets"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Delete</span>
          </Button>

          {/* Close Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-8 px-2 hover:bg-gray-50"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Layout - Stacked */}
      <div className="sm:hidden">
        <div className="flex items-center justify-center gap-2 px-4 pb-3">
          <Button size="sm" onClick={onEdit} className="flex-1 text-xs">
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onTag} className="flex-1 text-xs">
            <Tag className="w-3 h-3 mr-1" />
            Tag
          </Button>
          <Button size="sm" variant="outline" onClick={onMove} className="flex-1 text-xs">
            <FolderIcon className="w-3 h-3 mr-1" />
            Move
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={onDelete} 
            className="flex-1 text-xs"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
