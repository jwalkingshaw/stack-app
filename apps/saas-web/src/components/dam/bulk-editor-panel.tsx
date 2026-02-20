"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Save, Loader2, Tag, FileText, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssetTag } from "@tradetool/types";

interface Asset {
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
}

interface BulkEditorPanelProps {
  assets: Asset[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: BulkUpdateData) => Promise<void>;
  availableTags: AssetTag[];
}

interface BulkUpdateData {
  updateFields: {
    tags?: {
      mode: 'replace' | 'add' | 'remove';
      tagIds: string[];
    };
    description?: {
      mode: 'replace' | 'append';
      value: string;
    };
  };
}

interface FieldState {
  enabled: boolean;
  mode: 'replace' | 'add' | 'remove' | 'append';
}

export function BulkEditorPanel({ 
  assets, 
  isOpen, 
  onClose, 
  onSave, 
  availableTags,
}: BulkEditorPanelProps) {
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({
    tags: { enabled: false, mode: 'add' },
    description: { enabled: false, mode: 'replace' },
  });
  
  const [formData, setFormData] = useState({
    tagIds: [] as string[],
    description: '',
  });
  const [tagFilter, setTagFilter] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{
    total: number;
    completed: number;
    errors: Array<{ assetId: string; error: string }>;
  } | null>(null);

  // Reset form when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      setFieldStates({
        tags: { enabled: false, mode: 'add' },
        description: { enabled: false, mode: 'replace' },
      });
      setFormData({
        tagIds: [],
        description: '',
      });
      setTagFilter("");
      setSaveProgress(null);
    }
  }, [isOpen]);

  const handleFieldToggle = (field: string) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        enabled: !prev[field].enabled
      }
    }));
  };

  const handleModeChange = (field: string, mode: string) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        mode: mode as any
      }
    }));
  };

  const filteredTags = useMemo(() => {
    const query = tagFilter.trim().toLowerCase();
    if (!query) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, tagFilter]);

  const toggleTag = useCallback((tagId: string) => {
    setFormData(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter(id => id !== tagId)
        : [...prev.tagIds, tagId]
    }));
  }, []);

  const handleSave = useCallback(async () => {
    const enabledFields = Object.entries(fieldStates)
      .filter(([_, state]) => state.enabled)
      .reduce((acc, [field, state]) => {
        if (field === 'tags') {
          acc.tags = {
            mode: state.mode as 'replace' | 'add' | 'remove',
            tagIds: formData.tagIds
          };
        } else if (field === 'description' && formData.description.trim()) {
          acc.description = {
            mode: state.mode as 'replace' | 'append',
            value: formData.description.trim()
          };
        }
        return acc;
      }, {} as BulkUpdateData['updateFields']);

    if (Object.keys(enabledFields).length === 0) {
      return;
    }

    setIsSaving(true);
    setSaveProgress({
      total: assets.length,
      completed: 0,
      errors: []
    });
    
    try {
      await onSave({ updateFields: enabledFields });
    } catch (error) {
      console.error('Bulk save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [fieldStates, formData, assets.length, onSave]);

  const getPreviewText = () => {
    const enabledFields = Object.entries(fieldStates).filter(([_, state]) => state.enabled);
    if (enabledFields.length === 0) return "Select fields to preview changes";
    
    const previews: string[] = [];
    
    enabledFields.forEach(([field, state]) => {
      if (field === 'tags') {
        const modeText = ({
          add: 'Add tags',
          replace: 'Replace all tags with',
          remove: 'Remove tags'
        } as any)[state.mode];
        const names = formData.tagIds
          .map((id) => availableTags.find((tag) => tag.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        previews.push(`${modeText}: ${names || '(none)'}`);
      } else if (field === 'description' && formData.description.trim()) {
        const modeText = ({
          replace: 'Set description to',
          append: 'Append to description'
        } as any)[state.mode];
        previews.push(`${modeText}: "${formData.description.trim()}"`);
      }
    });
    
    return previews.join(' • ');
  };

  const hasChangesToApply = Object.entries(fieldStates).some(([field, state]) => {
    if (!state.enabled) return false;
    if (field === 'tags') {
      if (state.mode === 'replace') return true;
      return formData.tagIds.length > 0;
    }
    if (field === 'description') return formData.description.trim().length > 0;
    return false;
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl transition-transform duration-300 ease-out z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Edit Assets</h2>
            <p className="text-sm text-gray-600 mt-1">
              {assets.length} assets selected
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
          {/* Progress Display */}
          {saveProgress && (
            <div className="p-6 border-b bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">
                  Updating assets...
                </span>
                <span className="text-sm text-blue-700">
                  {saveProgress.completed}/{saveProgress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(saveProgress.completed / saveProgress.total) * 100}%` }}
                />
              </div>
              {saveProgress.errors.length > 0 && (
                <div className="mt-3 text-sm text-red-600">
                  {saveProgress.errors.length} errors occurred
                </div>
              )}
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Tags Field */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="enable-tags"
                  checked={fieldStates.tags.enabled}
                  onChange={() => handleFieldToggle('tags')}
                  className="w-4 h-4 text-blue-600 border-input rounded focus:ring-blue-500"
                />
                <label htmlFor="enable-tags" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </label>
              </div>

              {fieldStates.tags.enabled && (
                <div className="ml-7 space-y-3">
                  <Select
                    value={fieldStates.tags.mode}
                    onValueChange={(value) => handleModeChange('tags', value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add to existing tags</SelectItem>
                      <SelectItem value="replace">Replace all tags</SelectItem>
                      <SelectItem value="remove">Remove these tags</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    placeholder="Search tags..."
                    className="text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    {filteredTags.length === 0 && (
                      <span className="text-xs text-gray-500">No tags found</span>
                    )}
                    {filteredTags.map((tag) => {
                      const isSelected = formData.tagIds.includes(tag.id);
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? "default" : "secondary"}
                          className={cn(
                            "text-xs px-2 py-1 cursor-pointer transition-colors",
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
              )}
            </div>

            {/* Description Field */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="enable-description"
                  checked={fieldStates.description.enabled}
                  onChange={() => handleFieldToggle('description')}
                  className="w-4 h-4 text-blue-600 border-input rounded focus:ring-blue-500"
                />
                <label htmlFor="enable-description" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Description
                </label>
              </div>

              {fieldStates.description.enabled && (
                <div className="ml-7 space-y-3">
                  {/* Mode Selection */}
                  <Select
                    value={fieldStates.description.mode}
                    onValueChange={(value) => handleModeChange('description', value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="replace">Replace description</SelectItem>
                      <SelectItem value="append">Append to description</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Description Textarea */}
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter description..."
                    rows={3}
                    className="w-full resize-none text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview & Actions Footer */}
        <div className="border-t bg-gray-50 p-6">
          {/* Preview */}
          <div className="mb-4 p-3 bg-white border border-border rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-gray-600">
                <div className="font-medium text-gray-900 mb-1">Preview changes:</div>
                {getPreviewText()}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChangesToApply || isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Apply to {assets.length}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
