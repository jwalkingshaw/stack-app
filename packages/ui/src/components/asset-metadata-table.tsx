'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  AssetMetadata, 
  FieldSchema, 
  getVisibleFields, 
  validateAssetMetadata,
  ASSET_METADATA_SCHEMA,
  AssetScope 
} from './asset-metadata-schema';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from './dropdown-menu';
import { Button } from './button';
import { 
  ChevronDown, 
  Check, 
  X, 
  AlertTriangle, 
  AlertCircle,
  Filter,
  Copy,
  Download,
  MoreHorizontal,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';

interface CellEditorProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isActive: boolean;
}

const CellEditor: React.FC<CellEditorProps> = React.memo(({ 
  field, 
  value, 
  onChange, 
  onBlur, 
  onKeyDown, 
  isActive 
}) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
      if (field.type === 'text' || field.type === 'textarea') {
        (inputRef.current as HTMLInputElement | HTMLTextAreaElement).select();
      }
    }
  }, [isActive, field.type]);

  const handleMultiselectToggle = useCallback((optionValue: string) => {
    const currentValues = Array.isArray(value) ? value : [];
    const newValues = currentValues.includes(optionValue)
      ? currentValues.filter(v => v !== optionValue)
      : [...currentValues, optionValue];
    onChange(newValues);
  }, [value, onChange]);

  if (!isActive) {
    // Display mode
    if (field.type === 'boolean') {
      return (
        <div className="flex items-center justify-center">
          {value ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <X className="w-4 h-4 text-red-400" />
          )}
        </div>
      );
    }

    if (field.type === 'multiselect') {
      const displayValue = Array.isArray(value) && value.length > 0 
        ? value.join(', ') 
        : '';
      return (
        <div className="truncate text-sm" title={displayValue}>
          {displayValue || <span className="text-muted-foreground">—</span>}
        </div>
      );
    }

    if (field.type === 'select') {
      const option = field.options?.find(opt => opt.value === value);
      return (
        <div className="truncate text-sm">
          {option ? option.label : (value || <span className="text-muted-foreground">—</span>)}
        </div>
      );
    }

    return (
      <div className="truncate text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    );
  }

  // Edit mode
  const baseInputClass = "w-full px-2 py-1 text-sm bg-white border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/20";

  if (field.type === 'textarea') {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cn(baseInputClass, "resize-none min-h-[60px]")}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={value?.toString() || 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={baseInputClass}
      >
        <option value="false">No</option>
        <option value="true">Yes</option>
      </select>
    );
  }

  if (field.type === 'select') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={baseInputClass}
      >
        <option value="">Select...</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'multiselect') {
    const [isOpen, setIsOpen] = React.useState(false);
    
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <div 
            className={cn(baseInputClass, "cursor-pointer flex items-center justify-between")}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsOpen(true);
                e.preventDefault();
              } else {
                onKeyDown(e);
              }
            }}
          >
            <span>{Array.isArray(value) && value.length > 0 ? `${value.length} selected` : 'Select...'}</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" onCloseAutoFocus={() => { onBlur(); setIsOpen(false); }}>
          {field.options?.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={Array.isArray(value) && value.includes(option.value)}
              onCheckedChange={() => {
                handleMultiselectToggle(option.value);
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (field.type === 'number') {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || null)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={baseInputClass}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={baseInputClass}
      />
    );
  }

  // Default to text input
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={baseInputClass}
      placeholder={field.placeholder}
    />
  );
});

interface AssetMetadataTableProps {
  assets: AssetMetadata[];
  onAssetUpdate: (assetId: string, updates: Partial<AssetMetadata>) => void;
  onBulkUpdate?: (assetIds: string[], updates: Partial<AssetMetadata>) => void;
  className?: string;
}

export const AssetMetadataTable: React.FC<AssetMetadataTableProps> = ({
  assets,
  onAssetUpdate,
  onBulkUpdate,
  className
}) => {
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<{ assetId: string; fieldKey: string } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Get visible fields based on the first asset's scope (assuming homogeneous scopes for now)
  const visibleFields = useMemo(() => {
    if (assets.length === 0) return [];
    const fields = getVisibleFields(assets[0].assetScope);
    return fields.filter(field => !hiddenColumns.includes(field.key));
  }, [assets, hiddenColumns]);

  // Apply filters and sorting
  const filteredAndSortedAssets = useMemo(() => {
    let result = [...assets];

    // Apply filters
    Object.entries(filters).forEach(([fieldKey, filterValue]) => {
      if (filterValue) {
        result = result.filter(asset => {
          const value = (asset as any)[fieldKey];
          if (Array.isArray(value)) {
            return value.some(v => v.toLowerCase().includes(filterValue.toLowerCase()));
          }
          return String(value || '').toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });

    // Apply sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [assets, filters, sortConfig]);

  // Calculate validation stats
  const validationStats = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    
    assets.forEach(asset => {
      const validation = validateAssetMetadata(asset);
      errors += Object.keys(validation.errors).length;
      warnings += Object.keys(validation.warnings).length;
    });

    return { errors, warnings };
  }, [assets]);

  const handleCellClick = useCallback((assetId: string, fieldKey: string) => {
    setActiveCell({ assetId, fieldKey });
  }, []);

  const handleCellChange = useCallback((assetId: string, fieldKey: string, value: any) => {
    onAssetUpdate(assetId, { [fieldKey]: value });
  }, [onAssetUpdate]);


  const handleCellBlur = useCallback(() => {
    setActiveCell(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, assetId: string, fieldKey: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setActiveCell(null);
    } else if (e.key === 'Escape') {
      setActiveCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const currentAssetIndex = filteredAndSortedAssets.findIndex(asset => asset.id === assetId);
      const currentFieldIndex = visibleFields.findIndex(field => field.key === fieldKey);
      
      if (e.shiftKey) {
        // Move to previous cell
        if (currentFieldIndex > 0) {
          setActiveCell({ assetId, fieldKey: visibleFields[currentFieldIndex - 1].key });
        } else if (currentAssetIndex > 0) {
          setActiveCell({ 
            assetId: filteredAndSortedAssets[currentAssetIndex - 1].id, 
            fieldKey: visibleFields[visibleFields.length - 1].key 
          });
        }
      } else {
        // Move to next cell
        if (currentFieldIndex < visibleFields.length - 1) {
          setActiveCell({ assetId, fieldKey: visibleFields[currentFieldIndex + 1].key });
        } else if (currentAssetIndex < filteredAndSortedAssets.length - 1) {
          setActiveCell({ 
            assetId: filteredAndSortedAssets[currentAssetIndex + 1].id, 
            fieldKey: visibleFields[0].key 
          });
        }
      }
    }
  }, [filteredAndSortedAssets, visibleFields]);

  const handleSort = useCallback((fieldKey: string) => {
    setSortConfig(prev => {
      if (prev?.key === fieldKey) {
        return prev.direction === 'asc' 
          ? { key: fieldKey, direction: 'desc' }
          : null;
      }
      return { key: fieldKey, direction: 'asc' };
    });
  }, []);

  const toggleColumnVisibility = useCallback((fieldKey: string) => {
    setHiddenColumns(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(key => key !== fieldKey)
        : [...prev, fieldKey]
    );
  }, []);

  const handleSelectAsset = useCallback((assetId: string, checked: boolean) => {
    setSelectedAssets(prev => 
      checked 
        ? [...prev, assetId]
        : prev.filter(id => id !== assetId)
    );
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedAssets(checked ? filteredAndSortedAssets.map(asset => asset.id) : []);
  }, [filteredAndSortedAssets]);

  const getColumnWidth = (field: FieldSchema) => {
    switch (field.width) {
      case 'sm': return 'w-24';
      case 'md': return 'w-32';
      case 'lg': return 'w-48';
      case 'xl': return 'w-64';
      default: return 'w-32';
    }
  };

  if (assets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No assets to configure. Please select files first.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Pre-flight Panel */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-foreground">Asset Metadata</h3>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>{assets.filter(a => validateAssetMetadata(a).isValid).length} Ready</span>
              </div>
              {validationStats.errors > 0 && (
                <div className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{validationStats.errors} Errors</span>
                </div>
              )}
              {validationStats.warnings > 0 && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{validationStats.warnings} Warnings</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Column visibility toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <EyeOff className="w-4 h-4 mr-2" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {Object.values(ASSET_METADATA_SCHEMA).map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.key}
                    checked={!hiddenColumns.includes(field.key)}
                    onCheckedChange={() => toggleColumnVisibility(field.key)}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk actions */}
            {selectedAssets.length > 0 && onBulkUpdate && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="w-4 h-4 mr-2" />
                    Bulk Actions ({selectedAssets.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => {/* Implement bulk edit modal */}}>
                    Edit Selected
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {/* Implement bulk copy */}}>
                    Copy Metadata
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-auto border border-border rounded-lg bg-card">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="w-12 p-2 text-left">
                <input
                  type="checkbox"
                  checked={selectedAssets.length === filteredAndSortedAssets.length && filteredAndSortedAssets.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded"
                />
              </th>
              <th className="w-16 p-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Preview
              </th>
              {visibleFields.map((field) => (
                <th 
                  key={field.key} 
                  className={cn(
                    "p-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-l border-border/50",
                    getColumnWidth(field)
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => field.sortable && handleSort(field.key)}
                      className={cn(
                        "flex items-center gap-1 hover:text-foreground transition-colors",
                        field.sortable && "cursor-pointer"
                      )}
                    >
                      <span>{field.label}</span>
                      {field.validation?.required && <span className="text-red-500">*</span>}
                      {sortConfig?.key === field.key && (
                        <span className="text-primary">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                    {field.searchable && (
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters[field.key] || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="ml-2 w-16 px-1 py-0.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedAssets.map((asset) => {
              const validation = validateAssetMetadata(asset);
              const hasErrors = Object.keys(validation.errors).length > 0;
              const hasWarnings = Object.keys(validation.warnings).length > 0;
              
              return (
                <tr 
                  key={asset.id} 
                  className={cn(
                    "border-b border-border hover:bg-muted/30 transition-colors",
                    hasErrors && "bg-red-50 dark:bg-red-950/20",
                    hasWarnings && !hasErrors && "bg-yellow-50 dark:bg-yellow-950/20"
                  )}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedAssets.includes(asset.id)}
                      onChange={(e) => handleSelectAsset(asset.id, e.target.checked)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-2">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                      {asset.mimeType?.startsWith('image/') && asset.preview ? (
                        <img src={asset.preview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">📄</span>
                      )}
                    </div>
                  </td>
                  {visibleFields.map((field) => {
                    const value = (asset as any)[field.key];
                    const isActive = activeCell?.assetId === asset.id && activeCell?.fieldKey === field.key;
                    const fieldError = validation.errors[field.key];
                    const fieldWarning = validation.warnings[field.key];
                    
                    return (
                      <td 
                        key={field.key} 
                        className={cn(
                          "p-2 border-l border-border/50 relative",
                          getColumnWidth(field),
                          "cursor-pointer hover:bg-muted/50 transition-colors"
                        )}
                        onClick={() => handleCellClick(asset.id, field.key)}
                      >
                        <div className="relative">
                          <CellEditor
                            field={field}
                            value={value}
                            onChange={(newValue) => handleCellChange(asset.id, field.key, newValue)}
                            onBlur={handleCellBlur}
                            onKeyDown={(e) => handleKeyDown(e, asset.id, field.key)}
                            isActive={isActive}
                          />
                          {(fieldError || fieldWarning) && (
                            <div className={cn(
                              "absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
                              fieldError ? "bg-red-500" : "bg-yellow-500"
                            )}>
                              {fieldError ? (
                                <AlertCircle className="w-2 h-2 text-white" />
                              ) : (
                                <AlertTriangle className="w-2 h-2 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                        {(fieldError || fieldWarning) && (
                          <div className="absolute z-10 bottom-full left-0 mb-1 p-2 bg-popover text-popover-foreground text-xs rounded shadow-md border border-border max-w-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {fieldError || fieldWarning}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSortedAssets.length} of {assets.length} assets
        {selectedAssets.length > 0 && ` • ${selectedAssets.length} selected`}
      </div>
    </div>
  );
};