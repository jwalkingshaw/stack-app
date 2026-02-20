"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Save,
  Loader2,
  Tag as TagIcon,
  FileText,
  Link2,
  Calendar,
  User,
  Plus,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DamAsset,
  AssetTag,
  AssetCategory,
  AssetTagAssignment,
  AssetCategoryAssignment,
} from "@tradetool/types";

type AssetWithAssignments = DamAsset & {
  tagAssignments: AssetTagAssignment[];
  categoryAssignments: AssetCategoryAssignment[];
};

type AssetEditorSavePayload = {
  filename?: string;
  description?: string | null;
  tagIds?: string[];
  categoryIds?: string[];
  primaryCategoryId?: string | null;
};

interface AssetEditorPanelProps {
  asset: AssetWithAssignments | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: AssetEditorSavePayload) => Promise<void>;
  onDelete: (assetId: string) => Promise<void>;
  availableTags: AssetTag[];
  availableCategories: AssetCategory[];
  onCreateTag: (name: string) => Promise<AssetTag>;
}

const arrayEquals = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

export function AssetEditorPanel({
  asset,
  isOpen,
  onClose,
  onSave,
  onDelete,
  availableTags,
  availableCategories,
  onCreateTag,
}: AssetEditorPanelProps) {
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const initialState = useMemo(() => {
    if (!asset) {
      return {
        filename: "",
        description: "",
        tagIds: [] as string[],
        categoryIds: [] as string[],
        primaryCategoryId: null as string | null,
      };
    }

    const initialTagIds = asset.tagAssignments.map((assignment) => assignment.tagId);
    const initialCategoryIds = asset.categoryAssignments.map(
      (assignment) => assignment.categoryId
    );
    const initialPrimary = asset.categoryAssignments.find((assignment) => assignment.isPrimary)
      ?.categoryId || null;

    return {
      filename: asset.filename,
      description: asset.description || "",
      tagIds: initialTagIds,
      categoryIds: initialCategoryIds,
      primaryCategoryId: initialPrimary,
    };
  }, [asset]);

  useEffect(() => {
    if (asset) {
      setFilename(asset.filename);
      setDescription(asset.description || "");
      setSelectedTagIds(initialState.tagIds);
      setSelectedCategoryIds(initialState.categoryIds);
      setPrimaryCategoryId(initialState.primaryCategoryId);
      setTagFilter("");
      setNewTagName("");
      setIsDeleting(false);
    }
  }, [asset, initialState]);

  const hasChanges = useMemo(() => {
    if (!asset) return false;
    if (filename.trim() !== initialState.filename) return true;
    if ((description || "").trim() !== (initialState.description || "")) return true;
    if (!arrayEquals(selectedTagIds, initialState.tagIds)) return true;
    if (!arrayEquals(selectedCategoryIds, initialState.categoryIds)) return true;
    if ((primaryCategoryId || null) !== (initialState.primaryCategoryId || null)) return true;
    return false;
  }, [
    asset,
    filename,
    description,
    selectedTagIds,
    selectedCategoryIds,
    primaryCategoryId,
    initialState,
  ]);

  const filteredTags = useMemo(() => {
    const query = tagFilter.trim().toLowerCase();
    if (!query) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, tagFilter]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const toggleCategory = useCallback(
    (categoryId: string) => {
      setSelectedCategoryIds((prev) => {
        if (prev.includes(categoryId)) {
          const next = prev.filter((id) => id !== categoryId);
          if (primaryCategoryId === categoryId) {
            setPrimaryCategoryId(null);
          }
          return next;
        }
        return [...prev, categoryId];
      });
    },
    [primaryCategoryId]
  );

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const created = await onCreateTag(name);
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
      setTagFilter("");
    } catch (error) {
      console.error("Failed to create tag", error);
    }
  }, [newTagName, onCreateTag]);

  const handleSave = useCallback(async () => {
    if (!asset || !hasChanges) return;
    setIsSaving(true);
    try {
      await onSave({
        filename: filename.trim(),
        description: description.trim(),
        tagIds: selectedTagIds,
        categoryIds: selectedCategoryIds,
        primaryCategoryId,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    asset,
    hasChanges,
    onSave,
    filename,
    description,
    selectedTagIds,
    selectedCategoryIds,
    primaryCategoryId,
  ]);

  const handleDelete = useCallback(async () => {
    if (!asset) return;
    const confirmed = confirm("Delete this asset? This action cannot be undone.");
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await onDelete(asset.id);
    } finally {
      setIsDeleting(false);
    }
  }, [asset, onDelete]);

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + "MB";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!asset) return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity z-40",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <div
        className={cn(
          "fixed inset-y-0 right-0 w-full max-w-3xl bg-white shadow-xl transform transition-transform duration-300 z-50 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="border-b p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Asset Details</h2>
            <p className="text-sm text-gray-500">
              {asset.originalFilename} • {formatFileSize(asset.fileSize)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filename</label>
              <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this asset..."
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <TagIcon className="w-4 h-4 inline mr-2" />
                Tags
              </label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    placeholder="Search tags..."
                    className="flex-1"
                  />
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag name"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {filteredTags.length === 0 && (
                    <span className="text-sm text-gray-500">No tags found</span>
                  )}
                  {filteredTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? "default" : "secondary"}
                        className={cn(
                          "cursor-pointer text-xs px-2 py-1 transition-colors",
                          isSelected ? "bg-blue-600 hover:bg-blue-700 text-white" : ""
                        )}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categories
              </label>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {availableCategories.length === 0 && (
                    <span className="text-sm text-gray-500">
                      No categories defined yet. Create categories in settings.
                    </span>
                  )}
                  {availableCategories.map((category) => {
                    const isSelected = selectedCategoryIds.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className={cn(
                          "flex items-center gap-2 border rounded-full px-3 py-1 text-xs transition-colors",
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-600"
                            : "border-border hover:border-blue-300"
                        )}
                      >
                        {category.path || category.name}
                      </button>
                    );
                  })}
                </div>
                {selectedCategoryIds.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Primary category</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPrimaryCategoryId(null)}
                        className={cn(
                          "px-2 py-1 text-xs border rounded-full",
                          primaryCategoryId === null
                            ? "border-blue-500 bg-blue-50 text-blue-600"
                            : "border-border hover:border-blue-300"
                        )}
                      >
                        None
                      </button>
                      {selectedCategoryIds.map((categoryId) => {
                        const category = availableCategories.find((c) => c.id === categoryId);
                        if (!category) return null;
                        const isPrimary = primaryCategoryId === category.id;
                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => setPrimaryCategoryId(category.id)}
                            className={cn(
                              "px-2 py-1 text-xs border rounded-full",
                              isPrimary
                                ? "border-blue-500 bg-blue-50 text-blue-600"
                                : "border-border hover:border-blue-300"
                            )}
                          >
                            {category.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Link2 className="w-4 h-4 inline mr-2" />
                Product Links
              </label>
              <div className="p-4 border border-dashed border-input rounded-lg text-center">
                <p className="text-sm text-gray-500">Product linking will be available soon</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t bg-gray-50 p-6">
          <div className="mb-4 text-xs text-gray-500 space-y-1">
            <div className="flex items-center">
              <User className="w-3 h-3 mr-2" />
              Created by {asset.createdBy}
            </div>
            <div className="flex items-center">
              <Calendar className="w-3 h-3 mr-2" />
              {formatDate(asset.createdAt)}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="flex-1"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || isDeleting}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
