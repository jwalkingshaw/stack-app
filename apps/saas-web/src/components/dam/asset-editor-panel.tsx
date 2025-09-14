"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Save, Loader2, Tag, FileText, Link2, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AssetEditorPanelProps {
  asset: {
    id: string;
    filename: string;
    originalFilename: string;
    fileType: string;
    fileSize: number;
    mimeType: string;
    s3Url: string;
    tags: string[];
    description?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    preview?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: { tags: string[]; description: string; filename: string }) => Promise<void>;
  tenantSlug: string;
}

export function AssetEditorPanel({ 
  asset, 
  isOpen, 
  onClose, 
  onSave, 
  tenantSlug 
}: AssetEditorPanelProps) {
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form when asset changes
  useEffect(() => {
    if (asset) {
      setFilename(asset.filename);
      setDescription(asset.description || "");
      setTags(asset.tags || []);
      setHasChanges(false);
    }
  }, [asset]);

  // Track changes
  useEffect(() => {
    if (asset) {
      const changed = 
        filename !== asset.filename ||
        description !== (asset.description || "") ||
        JSON.stringify(tags) !== JSON.stringify(asset.tags || []);
      setHasChanges(changed);
    }
  }, [filename, description, tags, asset]);

  const handleSave = useCallback(async () => {
    if (!asset || !hasChanges) return;
    
    setIsSaving(true);
    try {
      await onSave({ 
        filename: filename.trim(), 
        description: description.trim(), 
        tags 
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save asset:', error);
    } finally {
      setIsSaving(false);
    }
  }, [asset, filename, description, tags, hasChanges, onSave]);

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
      setNewTag("");
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      handleAddTag();
    }
  }, [newTag, handleAddTag]);

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!asset) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity z-40",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl transition-transform duration-300 ease-out z-50 flex flex-col",
          isOpen ? "transform translate-x-0" : "transform translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Asset</h2>
            <p className="text-sm text-gray-600 mt-1">
              {asset.fileType.charAt(0).toUpperCase() + asset.fileType.slice(1)} • {formatFileSize(asset.fileSize)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Preview */}
          <div className="p-6 border-b">
            {asset.preview || asset.mimeType.startsWith('image/') ? (
              <img
                src={asset.preview || asset.s3Url}
                alt={asset.filename}
                className="w-full h-48 object-cover rounded-lg bg-gray-100"
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">{asset.mimeType}</p>
                </div>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="p-6 space-y-6">
            {/* Filename */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Filename
              </label>
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Enter filename..."
                className="w-full"
              />
            </div>

            {/* Description */}
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
                className="w-full resize-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Tag className="w-4 h-4 inline mr-2" />
                Tags
              </label>
              
              {/* Existing tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-xs px-2 py-1 cursor-pointer hover:bg-gray-200"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      {tag}
                      <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add new tag */}
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Add tag..."
                  className="flex-1"
                />
                <Button
                  onClick={handleAddTag}
                  disabled={!newTag.trim()}
                  size="sm"
                  variant="outline"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Product Linking - Placeholder for future implementation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Link2 className="w-4 h-4 inline mr-2" />
                Product Links
              </label>
              <div className="p-4 border border-dashed border-input rounded-lg text-center">
                <p className="text-sm text-gray-500">
                  Product linking will be available soon
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with metadata and actions */}
        <div className="border-t bg-gray-50 p-6">
          {/* Metadata */}
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

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
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