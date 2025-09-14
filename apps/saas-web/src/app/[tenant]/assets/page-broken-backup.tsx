"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Bookmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogOverlay } from "@tradetool/ui";
import Image from "next/image";
import { AppLayoutShell } from "@/components/AppLayoutShell";
import { useAuth } from "@/hooks/useAuth";


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

export default function AssetsPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  
  const [organization, setOrganization] = useState(null);
  const [assets, setAssets] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid, list, mosaic
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState("name"); // name, date, size, type


  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const response = await fetch(`/api/organizations/${tenantSlug}`);
        if (response.ok) {
          const data = await response.json();
          setOrganization(data.organization);
        } else if (response.status === 404) {
          console.warn(`Organization '${tenantSlug}' not found - using fallback`);
          // Organization will remain null, fallbacks will be used
        } else {
          console.error(`Failed to fetch organization: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('Failed to fetch organization:', error);
      }
    };

    if (tenantSlug) {
      fetchOrganization();
    }
  }, [tenantSlug]);


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

  // Clean up - removed old upload dialog functions
  const handleFilesSelected = async (files: File[]) => {
    console.log('Files selected for upload:', files);
    
    // Create AssetMetadata objects for each file
    const filesWithMetadata = files.map(file => {
      const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      
      // Create preview URL for images
      let preview = undefined;
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
      }
      
      return {
        // Auto-populated fields
        id,
        filename: file.name,
        originalFilename: file.name,
        fileType: file.type.startsWith('image/') ? 'image' : 
                  file.type.startsWith('video/') ? 'video' :
                  file.type.includes('pdf') ? 'document' : 'other',
        fileSize: file.size,
        mimeType: file.type,
        preview,
        uploadStatus: 'pending' as const,
        
        // Required baseline metadata with defaults
        assetScope: 'Product' as const, // Default to Product, user can change
        folder: 'Main',
        tags: [],
        
        // Initialize validation state
        errors: {},
        warnings: {},
        isValid: false,
        
        // Store the actual file for upload
        file // Adding this for upload processing
      };
    });
    
    setSelectedFiles(filesWithMetadata);
    setUploadStep('metadata'); // Move to metadata capture step
  };

  // Handle asset metadata updates
  const handleAssetUpdate = (assetId: string, updates: Partial<AssetMetadata>) => {
    console.log('🔄 Updating asset metadata:', { assetId, updates });
    
    setSelectedFiles(prev => 
      prev.map(asset => 
        asset.id === assetId 
          ? { ...asset, ...updates }
          : asset
      )
    );
  };

  // Handle bulk metadata updates
  const handleBulkUpdate = (assetIds: string[], updates: Partial<AssetMetadata>) => {
    console.log('🔄 Bulk updating assets:', { assetIds, updates });
    
    setSelectedFiles(prev => 
      prev.map(asset => 
        assetIds.includes(asset.id)
          ? { ...asset, ...updates }
          : asset
      )
    );
  };

  // Validate all assets before upload
  const canProceedToUpload = () => {
    return selectedFiles.every(asset => {
      const validation = validateAssetMetadata(asset);
      return validation.isValid;
    });
  };

  // Handle metadata form submission and actual upload
  const handleStartUpload = async () => {
    console.log('🚀 Starting server-side upload process...');
    setUploadStep('uploading');
    
    for (const fileData of selectedFiles) {
      try {
        console.log(`📁 Processing file: ${fileData.file.name}`);
        fileData.status = 'uploading';
        
        // Create FormData for server upload
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('folderId', selectedFolderId || '');
        
        // Extract relevant metadata for the upload
        const uploadMetadata = {
          assetScope: fileData.assetScope,
          productIdentifiers: fileData.productIdentifiers || [],
          campaignInitiative: fileData.campaignInitiative,
          brandBusinessUnit: fileData.brandBusinessUnit,
          folder: fileData.folder,
          category: fileData.category,
          description: fileData.description,
          tags: fileData.tags || [],
          
          // Product-specific fields
          parentSku: fileData.parentSku,
          flavor: fileData.flavor,
          doseForm: fileData.doseForm,
          
          // Rights & compliance
          talentPresent: fileData.talentPresent,
          releaseOnFile: fileData.releaseOnFile,
          usageTerritory: fileData.usageTerritory,
          brandLegalApproval: fileData.brandLegalApproval,
          ftcDisclosureRequired: fileData.ftcDisclosureRequired
        };
        
        formData.append('metadata', JSON.stringify(uploadMetadata));
        
        console.log('🔄 Uploading to server with metadata:', {
          filename: fileData.file.name,
          size: fileData.file.size,
          type: fileData.file.type,
          assetType: fileData.assetType,
          campaignName: fileData.campaignName
        });
        
        const uploadResponse = await fetch(`/api/${tenantSlug}/assets/upload`, {
          method: 'POST',
          body: formData,
        });

        console.log('📡 Upload response status:', uploadResponse.status, uploadResponse.statusText);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('❌ Upload error:', errorText);
          throw new Error(`Failed to upload: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
        }

        const responseData = await uploadResponse.json();
        console.log('✅ Upload response data:', responseData);
        const { data: assetData } = responseData;
        
        fileData.status = 'completed';
        fileData.assetData = assetData;
        
        console.log('🎉 File upload completed successfully:', fileData.file.name);
        
      } catch (error) {
        console.error('Upload failed:', error);
        fileData.status = 'error';
        fileData.error = error.message;
      }
    }
    
    setUploadStep('complete');
    
    // Refresh assets to show newly uploaded files
    await refreshAssets();
    
    // Auto-close modal after 2 seconds
    setTimeout(() => {
      setShowUploadDialog(false);
      setUploadStep('select');
      setSelectedFiles([]);
    }, 2000);
  };

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
    <AppLayoutShell 
      authContext={{ isAuthenticated, user }}
      showSidebar={true}
      sidebarDefaultOpen={true}
      headerProps={{
        orgSlug: tenantSlug,
        user,
        onLogout: logout
      }}
      sidebarProps={{
        organization: organization,
        orgSlug: tenantSlug,
        currentPath: `/${tenantSlug}/assets`,
        folders: folders,
        storageUsed: storageUsed,
        storageLimit: storageLimit,
      }}
    >
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
                  className="w-full pl-12 pr-6 py-3.5 text-base border border-input bg-background rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 placeholder:text-muted-foreground shadow-soft hover:shadow-medium hover:border-ring/50"
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
            
            {/* Upload Button */}
            <Button 
              size="lg" 
              className="w-full sm:w-auto"
              onClick={handleNavigateToUpload}
            >
              <Upload className="w-5 h-5" />
              Upload Assets
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Toolbar */}
      <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 shadow-soft">
                    <div>
                      <p className="text-gray-600 mb-4">
                        Select files to upload to your asset library. You can drag and drop or click to browse.
                      </p>
                      <FileUpload
                        onFilesSelected={handleFilesSelected}
                        maxFiles={20}
                        maxFileSize={100 * 1024 * 1024} // 100MB
                      />
                    </div>
                  )}

                  {/* Step 2: Metadata Capture */}
                  {uploadStep === 'metadata' && (
                    <div className="space-y-6">
                      <div className="bg-accent/20 border border-accent/30 rounded-lg p-4">
                        <h3 className="font-semibold text-accent-foreground mb-2">🎯 Nutrition Brand Asset Management</h3>
                        <p className="text-muted-foreground text-sm">
                          Configure metadata for your assets. Each asset must be anchored to either a Product Identifier or Campaign/Brand context.
                        </p>
                      </div>

                      <AssetMetadataTable 
                        assets={selectedFiles}
                        onAssetUpdate={handleAssetUpdate}
                        onBulkUpdate={handleBulkUpdate}
                      />

                      <div className="flex justify-between items-center">
                        <button 
                          onClick={() => setUploadStep('select')}
                          className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          ← Back to File Selection
                        </button>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            {canProceedToUpload() 
                              ? `${selectedFiles.length} assets ready` 
                              : `${selectedFiles.filter(asset => validateAssetMetadata(asset).isValid).length}/${selectedFiles.length} assets ready`
                            }
                          </span>
                          <button 
                            onClick={handleStartUpload}
                            disabled={!canProceedToUpload()}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            Upload {selectedFiles.length} Asset{selectedFiles.length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Uploading */}
                  {uploadStep === 'uploading' && (
                    <div className="space-y-4">
                      <div className="text-center mb-6">
                        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <h3 className="text-lg font-semibold mb-2">Uploading Assets</h3>
                        <p className="text-gray-600">Please wait while we process your files...</p>
                      </div>
                      
                      <div className="space-y-3">
                        {selectedFiles.map((fileData, index) => (
                          <div key={fileData.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-shrink-0">
                              {fileData.status === 'uploading' ? (
                                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              ) : fileData.status === 'processing' ? (
                                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                              ) : fileData.status === 'completed' ? (
                                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>
                              ) : fileData.status === 'error' ? (
                                <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">✗</div>
                              ) : (
                                <div className="w-5 h-5 bg-gray-300 rounded-full"></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{fileData.file.name}</p>
                              <p className="text-xs text-gray-500">
                                {fileData.status === 'uploading' ? 'Uploading to storage...' :
                                 fileData.status === 'processing' ? 'Processing metadata...' :
                                 fileData.status === 'completed' ? 'Upload complete' :
                                 fileData.status === 'error' ? `Error: ${fileData.error}` : 'Pending'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Complete */}
                  {uploadStep === 'complete' && (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        ✓
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Assets Uploaded Successfully!</h3>
                      <p className="text-gray-600">Your assets are now available in your library.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Toolbar */}
      <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-foreground">
                {filteredAssets.length} {filteredAssets.length === 1 ? 'asset' : 'assets'}
              </span>
              {filterTag && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm border border-primary/20 shadow-soft">
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
                className="text-sm border border-input rounded-xl px-4 py-2.5 bg-background shadow-soft hover:border-ring/50 hover:shadow-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 min-w-[120px]"
              >
                <option value="">All tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-input rounded-xl px-4 py-2.5 bg-background shadow-soft hover:border-ring/50 hover:shadow-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 min-w-[140px]"
              >
                <option value="name">Sort by name</option>
                <option value="date">Sort by date</option>
                <option value="size">Sort by size</option>
                <option value="type">Sort by type</option>
              </select>
            </div>
          </div>

          {/* Enhanced View Switcher */}
          <div className="flex items-center bg-muted/50 border border-border rounded-xl p-1.5 shadow-soft">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2.5 text-sm transition-all duration-200 rounded-lg ${
                viewMode === "grid" 
                  ? "bg-background shadow-soft text-primary border border-primary/20" 
                  : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2.5 text-sm transition-all duration-200 rounded-lg ${
                viewMode === "list" 
                  ? "bg-background shadow-soft text-primary border border-primary/20" 
                  : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("mosaic")}
              className={`px-3 py-2.5 text-sm transition-all duration-200 rounded-lg ${
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
                <div key={i} className={`${viewMode === "list" ? "h-16" : "aspect-square"} bg-muted rounded-xl animate-pulse shadow-soft`} />
              ))}
            </div>
          ) : (
            <div className={getGridClasses()}>
              {filteredAssets.map((asset) => {
                if (viewMode === "list") {
                  return (
                    <div key={asset.id} className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-medium hover:border-ring/20 transition-all duration-300 cursor-pointer hover:-translate-y-0.5">
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
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={asset.id} 
                    className={`group relative bg-card rounded-xl border border-border overflow-hidden hover:shadow-medium hover:border-ring/20 transition-all duration-300 cursor-pointer hover:-translate-y-1 ${
                      viewMode === "mosaic" ? "break-inside-avoid mb-6" : ""
                    }`}
                  >
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
                        <Button size="icon" variant="secondary" className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg">
                          <MoreHorizontal className="w-4 h-4" />
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
                {searchQuery || filterTag ? 'Try adjusting your search terms or filters to find what you’re looking for.' : 'Upload your first asset to get started with your digital library.'}
              </p>
              <Button size="lg" onClick={handleNavigateToUpload}>
                <Upload className="w-5 h-5" />
                Upload Assets
              </Button>
            </div>
          )}
        </div>
      </main>
    </AppLayoutShell>
  );
}