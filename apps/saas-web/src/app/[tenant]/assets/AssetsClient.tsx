"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, 
  Upload, 
  Search, 
  Filter, 
  Files,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  Download,
  ChevronRight,
  MoreHorizontal,
  Grid3X3,
  List,
  LayoutGrid,
  Star,
  Clock,
  Tag,
  Eye,
  Share2,
  Trash2,
  Settings,
  Home,
  Users,
  Bookmark,
  Edit3,
  Check,
  X,
  Edit,
  Trash,
  FolderIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogOverlay } from "@tradetool/ui";
import Image from "next/image";
import { AssetEditorPanel } from "@/components/dam/asset-editor-panel";
import { BulkActionToolbar } from "@/components/dam/bulk-action-toolbar";
import { BulkEditorPanel } from "@/components/dam/bulk-editor-panel";
import { KeyboardShortcutsHelp } from "@/components/dam/keyboard-shortcuts-help";
import { PageHeader } from "@/components/ui/page-header";

// Simple inline components for demo
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (mimeType.startsWith('video/')) return <FileText className="w-5 h-5 text-green-500" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  return <FileText className="w-5 h-5 text-gray-500" />;
}

interface AssetsClientProps {
  tenantSlug: string;
}

export default function AssetsClient({ tenantSlug }: AssetsClientProps) {
  const router = useRouter();
  
  const [assets, setAssets] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid, list, mosaic
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState("name"); // name, date, size, type
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);

  // Fetch real assets and folders
  useEffect(() => {
    const fetchAssetsData = async () => {
      try {
        setLoading(true);
        console.log('📥 Fetching assets data for tenant:', tenantSlug);
        
        const response = await fetch(`/api/${tenantSlug}/assets`);
        if (!response.ok) {
          throw new Error(`Failed to fetch assets: ${response.status}`);
        }
        
        const { data } = await response.json();
        console.log('📥 Assets data received:', data);
        
        setAssets(data.assets || []);
        setFolders(data.folders || []);
        
      } catch (error) {
        console.error('Failed to fetch assets data:', error);
        // Fallback to empty arrays on error
        setAssets([]);
        setFolders([]);
      } finally {
        setLoading(false);
      }
    };

    if (tenantSlug) {
      fetchAssetsData();
    }
  }, [tenantSlug]);

  // Refresh assets function
  const refreshAssets = async () => {
    try {
      console.log('🔄 Refreshing assets...');
      const response = await fetch(`/api/${tenantSlug}/assets`);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets: ${response.status}`);
      }
      
      const { data } = await response.json();
      setAssets(data.assets || []);
      setFolders(data.folders || []);
      console.log('✅ Assets refreshed');
    } catch (error) {
      console.error('Failed to refresh assets:', error);
    }
  };

  const storageUsed = 1024 * 1024 * 500; // 500MB
  const storageLimit = 5368709120; // 5GB

  const filteredAssets = assets
    .filter(asset => {
      const matchesSearch = asset.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesFilter = !filterTag || asset.tags.includes(filterTag);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.originalFilename.localeCompare(b.originalFilename);
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "size":
          return b.fileSize - a.fileSize;
        case "type":
          return a.fileType.localeCompare(b.fileType);
        default:
          return 0;
      }
    });

  const allTags = [...new Set(assets.flatMap(asset => asset.tags))];

  // Handle navigation to upload page
  const handleNavigateToUpload = () => {
    router.push(`/${tenantSlug}/assets/upload`);
  };

  // Handle asset editing
  const handleEditAsset = (asset) => {
    console.log('🔵 Opening asset editor for:', asset.id);
    setSelectedAsset({
      id: asset.id,
      filename: asset.filename,
      originalFilename: asset.originalFilename,
      fileType: asset.fileType,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      s3Url: asset.s3Url,
      tags: asset.tags || [],
      description: asset.description,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      preview: asset.thumbnailUrls?.medium || asset.s3Url
    });
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedAsset(null);
  };

  const handleSaveAsset = async (updates) => {
    try {
      console.log('🔵 Saving asset updates:', updates);
      
      const response = await fetch(`/api/${tenantSlug}/assets/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update asset: ${response.status}`);
      }

      const { data } = await response.json();
      console.log('🟢 Asset updated successfully:', data);
      
      // Update local state
      setAssets(prevAssets => 
        prevAssets.map(asset => 
          asset.id === selectedAsset.id 
            ? { ...asset, ...data }
            : asset
        )
      );
      
      // Update selected asset for the editor
      setSelectedAsset(prev => prev ? { ...prev, ...updates } : null);
      
    } catch (error) {
      console.error('🔴 Failed to save asset:', error);
      throw error;
    }
  };

  // Multi-select functionality
  const handleAssetSelect = (assetId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    
    if (event?.shiftKey && selectedAssetIds.size > 0) {
      // Range selection with Shift+click
      const assetIds = filteredAssets.map(a => a.id);
      const lastSelectedIndex = assetIds.findIndex(id => selectedAssetIds.has(id));
      const currentIndex = assetIds.indexOf(assetId);
      
      if (lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const rangeIds = assetIds.slice(start, end + 1);
        
        setSelectedAssetIds(prev => {
          const newSet = new Set(prev);
          rangeIds.forEach(id => newSet.add(id));
          return newSet;
        });
        return;
      }
    }
    
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      // Deselect all
      setSelectedAssetIds(new Set());
    } else {
      // Select all filtered assets
      setSelectedAssetIds(new Set(filteredAssets.map(asset => asset.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedAssetIds(new Set());
    setIsBulkMode(false);
    setIsBulkEditorOpen(false);
  };

  // Bulk action handlers
  const handleBulkEdit = () => {
    console.log('🔵 Opening bulk editor for assets:', selectedAssetIds);
    setIsBulkEditorOpen(true);
  };

  const handleBulkTag = () => {
    // Quick tag mode - open bulk editor with tags pre-selected
    setIsBulkEditorOpen(true);
  };

  const handleBulkMove = () => {
    console.log('🔵 Bulk move not implemented yet');
    // TODO: Implement folder selection modal
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedAssetIds.size} assets? This action cannot be undone.`)) {
      return;
    }
    
    console.log('🔵 Bulk delete assets:', selectedAssetIds);
    // TODO: Implement bulk delete API call
  };

  const handleBulkShare = () => {
    console.log('🔵 Bulk share not implemented yet');
    // TODO: Implement share modal
  };

  const handleBulkSave = async (updateData) => {
    try {
      console.log('🔵 Bulk saving updates:', updateData);
      
      // TODO: Call bulk update API
      const response = await fetch(`/api/${tenantSlug}/assets/bulk-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssetIds),
          updates: updateData.updateFields
        }),
      });

      if (!response.ok) {
        throw new Error(`Bulk update failed: ${response.status}`);
      }

      const { data } = await response.json();
      console.log('🟢 Bulk update successful:', data);
      
      // Refresh assets to show updates
      await refreshAssets();
      
      // Close bulk editor and clear selection
      setIsBulkEditorOpen(false);
      handleClearSelection();
      
    } catch (error) {
      console.error('🔴 Bulk update failed:', error);
      throw error;
    }
  };

  const selectedAssets = assets.filter(asset => selectedAssetIds.has(asset.id));
  const isAllSelected = filteredAssets.length > 0 && selectedAssetIds.size === filteredAssets.length;
  const isPartiallySelected = selectedAssetIds.size > 0 && selectedAssetIds.size < filteredAssets.length;
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A for select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && filteredAssets.length > 0) {
        e.preventDefault();
        handleSelectAll();
      }
      // Escape to clear selection
      if (e.key === 'Escape' && selectedAssetIds.size > 0) {
        handleClearSelection();
      }
      // Delete key for bulk delete
      if (e.key === 'Delete' && selectedAssetIds.size > 0 && !isEditorOpen && !isBulkEditorOpen) {
        handleBulkDelete();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAssets.length, selectedAssetIds.size, isEditorOpen, isBulkEditorOpen]);

  const getGridClasses = () => {
    switch (viewMode) {
      case "list":
        return "space-y-2";
      case "mosaic":
        return "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4";
      default: // grid
        return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        actions={[
          {
            label: "Upload Assets",
            onClick: handleNavigateToUpload,
            icon: Upload
          }
        ]}
      />
      
      {/* Enhanced Search Section */}
      <div className="bg-background border-b border-border px-4 py-4 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by filename, tags, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-6 py-2 h-8 text-sm border border-input bg-background rounded focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 placeholder:text-muted-foreground shadow-soft hover:shadow-medium hover:border-ring/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors w-5 h-5 rounded-full hover:bg-muted flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-sm text-muted-foreground mt-2 ml-1">
                  {filteredAssets.length} {filteredAssets.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                </p>
              )}
            </div>
            
          </div>
        </div>
      </div>

      {/* Enhanced Toolbar */}
      <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              {selectedAssetIds.size > 0 ? (
                <>
                  <button
                    onClick={handleClearSelection}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                  >
                    <X className="w-4 h-4" />
                    <span className="font-medium">{selectedAssetIds.size} selected</span>
                  </button>
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isAllSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold text-foreground">
                    {filteredAssets.length} {filteredAssets.length === 1 ? 'asset' : 'assets'}
                  </span>
                  {filteredAssets.length > 0 && (
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Select all
                    </button>
                  )}
                </>
              )}
              {filterTag && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded text-sm border border-primary/20 shadow-soft">
                  <Tag className="w-4 h-4" />
                  <span className="font-medium">{filterTag}</span>
                  <button 
                    onClick={() => setFilterTag("")}
                    className="ml-1 hover:bg-primary/20 rounded-full p-1 transition-colors w-5 h-5 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            
            {/* Enhanced Filters */}
            <div className="flex items-center gap-4">
              <select 
                value={filterTag} 
                onChange={(e) => setFilterTag(e.target.value)}
                className="text-sm border border-input rounded px-4 py-2 bg-background shadow-soft hover:border-ring/50 hover:shadow-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 min-w-[120px]"
              >
                <option value="">All tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-input rounded px-4 py-2 bg-background shadow-soft hover:border-ring/50 hover:shadow-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 min-w-[140px]"
              >
                <option value="name">Sort by name</option>
                <option value="date">Sort by date</option>
                <option value="size">Sort by size</option>
                <option value="type">Sort by type</option>
              </select>
            </div>
          </div>

          {/* Enhanced View Switcher */}
          <div className="flex items-center bg-muted/50 border border-border rounded p-1.5 shadow-soft">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                viewMode === "grid" 
                  ? "bg-background shadow-soft text-primary border border-primary/20" 
                  : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                viewMode === "list" 
                  ? "bg-background shadow-soft text-primary border border-primary/20" 
                  : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("mosaic")}
              className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                viewMode === "mosaic" 
                  ? "bg-background shadow-soft text-primary border border-primary/20" 
                  : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4 bg-background">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className={getGridClasses()}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`${viewMode === "list" ? "h-16" : "aspect-square"} bg-muted rounded animate-pulse shadow-soft`} />
              ))}
            </div>
          ) : (
            <div className={getGridClasses()}>
              {filteredAssets.map((asset) => {
                const isSelected = selectedAssetIds.has(asset.id);
                
                if (viewMode === "list") {
                  return (
                    <div key={asset.id} className={`group flex items-center gap-4 p-4 rounded border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-300 shadow-md' 
                        : 'bg-card border-border hover:shadow-medium hover:border-ring/20'
                    }`}>
                      {/* Selection Checkbox */}
                      <div className="flex-shrink-0">
                        <button
                          onClick={(e) => handleAssetSelect(asset.id, e)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-input hover:border-blue-400'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </button>
                      </div>
                      
                      <div className="w-14 h-14 bg-muted/30 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/50">
                        {asset.mimeType?.startsWith('image/') && (asset.thumbnailUrls?.medium || asset.s3Url) ? (
                          <img
                            src={asset.thumbnailUrls?.medium || asset.s3Url}
                            alt={asset.originalFilename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getFileIcon(asset.mimeType)
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {asset.originalFilename}
                          </h3>
                          {asset.favorite && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground font-medium">
                          <span>{formatFileSize(asset.fileSize)}</span>
                          <span className="capitalize">{asset.fileType}</span>
                          <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={() => handleEditAsset(asset)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={asset.id} 
                    className={`group relative rounded border overflow-hidden transition-all duration-300 cursor-pointer hover:-translate-y-1 ${
                      viewMode === "mosaic" ? "break-inside-avoid mb-6" : ""
                    } ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-300 shadow-lg' 
                        : 'bg-card border-border hover:shadow-medium hover:border-ring/20'
                    }`}
                  >
                    {/* Selection Checkbox - Top Left */}
                    <div className="absolute top-2 left-2 z-10">
                      <button
                        onClick={(e) => handleAssetSelect(asset.id, e)}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                            : 'bg-white border-input opacity-0 group-hover:opacity-100 hover:border-blue-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    </div>
                    
                    <div className={`bg-muted/30 relative ${viewMode === "mosaic" ? "" : "aspect-square"}`}>
                      {asset.mimeType?.startsWith('image/') && (asset.thumbnailUrls?.medium || asset.s3Url) ? (
                        <img
                          src={asset.thumbnailUrls?.medium || asset.s3Url}
                          alt={asset.originalFilename}
                          className={`w-full object-cover ${viewMode === "mosaic" ? "h-auto" : "h-full"}`}
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center">
                          {getFileIcon(asset.mimeType)}
                        </div>
                      )}
                      
                      {/* Favorite Star */}
                      {asset.favorite && (
                        <div className="absolute top-2 right-2">
                          <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        </div>
                      )}
                      
                      {/* Enhanced Hover Actions */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3">
                        <Button size="icon" variant="secondary" className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="secondary" className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg"
                          onClick={() => handleEditAsset(asset)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-foreground truncate mb-2" title={asset.originalFilename}>
                        {asset.originalFilename}
                      </h3>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-muted-foreground font-medium">
                          {formatFileSize(asset.fileSize)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(asset.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      {asset.tags && asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {asset.tags.slice(0, 2).map((tag, index) => (
                            <button
                              key={index}
                              onClick={() => setFilterTag(tag)}
                              className="inline-block px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all duration-200 border border-primary/20 font-medium"
                            >
                              {tag}
                            </button>
                          ))}
                          {asset.tags.length > 2 && (
                            <span className="inline-block px-2.5 py-1 text-xs bg-muted text-muted-foreground rounded-lg border border-border font-medium">
                              +{asset.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {!loading && filteredAssets.length === 0 && (
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-8 shadow-soft">
                <Files className="w-10 h-10 text-muted-foreground opacity-60" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">No assets found</h3>
              <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed mb-8">
                {searchQuery || filterTag ? `Try adjusting your search terms or filters to find what you're looking for.` : `Upload your first asset to get started with your digital library.`}
              </p>
              <Button size="lg" onClick={handleNavigateToUpload}>
                <Upload className="w-5 h-5" />
                Upload Assets
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Asset Editor Panel */}
      <AssetEditorPanel
        asset={selectedAsset}
        isOpen={isEditorOpen}
        onClose={handleCloseEditor}
        onSave={handleSaveAsset}
        tenantSlug={tenantSlug}
      />

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedAssetIds.size}
        onEdit={handleBulkEdit}
        onTag={handleBulkTag}
        onMove={handleBulkMove}
        onDelete={handleBulkDelete}
        onShare={handleBulkShare}
        onClear={handleClearSelection}
      />

      {/* Bulk Editor Panel */}
      <BulkEditorPanel
        assets={selectedAssets}
        isOpen={isBulkEditorOpen}
        onClose={() => setIsBulkEditorOpen(false)}
        onSave={handleBulkSave}
        tenantSlug={tenantSlug}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp />
    </div>
  );
}