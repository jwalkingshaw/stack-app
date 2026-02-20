"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Download,
  Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload, AssetMetadataTable, AssetMetadata, validateAssetMetadata, ProductLinkSuggestions } from "@tradetool/ui";
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// Upload workflow steps
type UploadStep = 'select' | 'metadata' | 'uploading' | 'complete';


// Storage keys for state persistence
const STORAGE_KEYS = {
  selectedFiles: 'dam_upload_selected_files',
  currentStep: 'dam_upload_current_step',
  uploadResults: 'dam_upload_results'
};

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const tenantSlug = params.tenant as string;
  
  // State management
  const [uploadStep, setUploadStep] = useState<UploadStep>('select');
  const [selectedFiles, setSelectedFiles] = useState<(AssetMetadata & { file: File })[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [productLinks, setProductLinks] = useState<Record<string, {productId: string, linkContext: string, confidence: number}>>({});
  const [availableProducts, setAvailableProducts] = useState<{id: string, sku: string, productName: string, brand: string}[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Load persisted state and products on mount
  useEffect(() => {
    const savedStep = sessionStorage.getItem(STORAGE_KEYS.currentStep) as UploadStep;
    const savedFiles = sessionStorage.getItem(STORAGE_KEYS.selectedFiles);
    
    if (savedStep && savedFiles) {
      setUploadStep(savedStep);
      try {
        // Note: File objects can't be serialized, so we'll need to handle this differently
        // For now, if there's persisted state but no files, reset to select step
        if (savedStep === 'metadata' || savedStep === 'uploading') {
          setUploadStep('select');
        }
      } catch (error) {
        console.warn('Failed to restore upload state:', error);
        setUploadStep('select');
      }
    }

    // Fetch available products (basic info only for performance)
    const fetchProducts = async () => {
      try {
        setIsLoadingProducts(true);
        const response = await fetch(`/api/${tenantSlug}/products/basic`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }
        
        const result = await response.json();
        
        if (result.success) {
          setAvailableProducts(result.data || []);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        setAvailableProducts([]);
      } finally {
        setIsLoadingProducts(false);
      }
    };

    if (tenantSlug) {
      fetchProducts();
    }
  }, [tenantSlug]);

  // Persist state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEYS.currentStep, uploadStep);
  }, [uploadStep]);

  // Handle file selection
  const handleFilesSelected = useCallback(async (files: File[]) => {
    console.log('📁 Files selected for full-page upload:', files);
    
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
        file
      } as AssetMetadata & { file: File };
    });
    
    setSelectedFiles(filesWithMetadata);
    setUploadStep('metadata');
  }, []);

  // Handle asset metadata updates
  const handleAssetUpdate = useCallback((assetId: string, updates: Partial<AssetMetadata>) => {
    console.log('🔄 Updating asset metadata:', { assetId, updates });
    
    setSelectedFiles(prev => 
      prev.map(asset => 
        asset.id === assetId 
          ? { ...asset, ...updates }
          : asset
      )
    );
  }, []);

  // Handle bulk metadata updates
  const handleBulkUpdate = useCallback((assetIds: string[], updates: Partial<AssetMetadata>) => {
    console.log('🔄 Bulk updating assets:', { assetIds, updates });
    
    setSelectedFiles(prev => 
      prev.map(asset => 
        assetIds.includes(asset.id)
          ? { ...asset, ...updates }
          : asset
      )
    );
  }, []);

  // Validate all assets before upload
  const canProceedToUpload = useCallback(() => {
    return selectedFiles.every(asset => {
      const validation = validateAssetMetadata(asset);
      return validation.isValid;
    });
  }, [selectedFiles]);

  // Calculate validation statistics
  const validationStats = useCallback(() => {
    let errors = 0;
    let warnings = 0;
    let ready = 0;
    
    selectedFiles.forEach(asset => {
      const validation = validateAssetMetadata(asset);
      errors += Object.keys(validation.errors).length;
      warnings += Object.keys(validation.warnings).length;
      if (validation.isValid) ready++;
    });

    return { errors, warnings, ready, total: selectedFiles.length };
  }, [selectedFiles]);

  // Handle upload process
  const handleStartUpload = async () => {
    if (!canProceedToUpload()) return;

    console.log('🚀 Starting background upload process...');
    setUploadStep('uploading');
    setIsUploading(true);
    
    const results: Record<string, 'success' | 'error'> = {};
    const errors: Record<string, string> = {};

    // Process uploads sequentially to avoid overwhelming the server
    for (const fileData of selectedFiles) {
      try {
        console.log(`📁 Processing file: ${fileData.file.name}`);
        
        // Update progress
        setUploadProgress(prev => ({ ...prev, [fileData.id]: 0 }));
        
        // Create FormData for server upload
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('folderId', ''); // Can be updated based on folder selection
        
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
        
        // Include product linking data if available
        const linkedProduct = productLinks[fileData.id];
        if (linkedProduct) {
          formData.append('productLink', JSON.stringify(linkedProduct));
        }
        
        // Upload to server
        const uploadResponse = await fetch(`/api/${tenantSlug}/assets/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Upload failed: ${errorText}`);
        }

        const result = await uploadResponse.json();
        console.log('✅ Upload successful:', result);
        
        setUploadProgress(prev => ({ ...prev, [fileData.id]: 100 }));
        results[fileData.id] = 'success';

      } catch (error) {
        console.error(`❌ Upload failed for ${fileData.file.name}:`, error);
        errors[fileData.id] = error instanceof Error ? error.message : 'Unknown error';
        results[fileData.id] = 'error';
        setUploadProgress(prev => ({ ...prev, [fileData.id]: -1 })); // -1 indicates error
      }
    }

    setUploadErrors(errors);
    setIsUploading(false);
    
    // Store results for potential retry
    sessionStorage.setItem(STORAGE_KEYS.uploadResults, JSON.stringify(results));
    
    // If all uploads successful, navigate back to assets page after a short delay
    const successCount = Object.values(results).filter(result => result === 'success').length;
    
    if (successCount === selectedFiles.length) {
      setUploadStep('complete');
      setTimeout(() => {
        handleReturnToAssets();
      }, 2000);
    } else {
      setUploadStep('complete');
    }
  };

  // Handle product linking
  const handleLinkProduct = useCallback(async (assetId: string, productId: string, linkContext: string, confidence: number) => {
    console.log('🔗 Linking product to asset:', { assetId, productId, linkContext, confidence });
    
    setProductLinks(prev => ({
      ...prev,
      [assetId]: { productId, linkContext, confidence }
    }));
    
    // Update asset metadata to include product identifier
    const linkedProduct = availableProducts.find(p => p.id === productId);
    if (linkedProduct) {
      handleAssetUpdate(assetId, {
        productIdentifiers: [linkedProduct.sku],
        assetScope: 'Product' as const
      });
    }
  }, [availableProducts, handleAssetUpdate]);

  const handleSkipProductLinking = useCallback((assetId: string) => {
    console.log('⏭️ Skipping product linking for asset:', assetId);
    // Could add analytics tracking here
  }, []);

  // Handle navigation back to assets page
  const handleReturnToAssets = useCallback(() => {
    // Clear persisted state
    Object.values(STORAGE_KEYS).forEach(key => sessionStorage.removeItem(key));
    
    // Navigate back to assets page
    router.push(`/${tenantSlug}/assets`);
  }, [router, tenantSlug]);

  // Handle step navigation
  const handleBackToSelect = useCallback(() => {
    setSelectedFiles([]);
    setUploadStep('select');
    setUploadProgress({});
    setUploadErrors({});
  }, []);

  const stats = validationStats();

  return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleReturnToAssets}
                  className="hover:bg-muted"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Upload Assets</h1>
                  <p className="text-sm text-muted-foreground">
                    {uploadStep === 'select' && 'Step 1: Select files to upload'}
                    {uploadStep === 'metadata' && `Step 2: Configure metadata for ${selectedFiles.length} assets`}
                    {uploadStep === 'uploading' && 'Step 3: Processing uploads...'}
                    {uploadStep === 'complete' && 'Upload completed'}
                  </p>
                </div>
              </div>

              {uploadStep === 'metadata' && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>{stats.ready} Ready</span>
                    </div>
                    {stats.errors > 0 && (
                      <div className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>{stats.errors} Errors</span>
                      </div>
                    )}
                    {stats.warnings > 0 && (
                      <div className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{stats.warnings} Warnings</span>
                      </div>
                    )}
                  </div>
                  
                  <Button 
                    onClick={handleStartUpload}
                    disabled={!canProceedToUpload() || isUploading}
                    className="min-w-[140px]"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {isUploading ? 'Uploading...' : `Upload ${stats.total} Assets`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-6 flex-1 flex flex-col">
          {/* Step 1: File Selection */}
          {uploadStep === 'select' && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Select Files to Upload</h2>
                <p className="text-muted-foreground">
                  Choose files from your computer to add to your asset library. 
                  You can select multiple files at once.
                </p>
              </div>
              
              <FileUpload
                onFilesSelected={handleFilesSelected}
                maxFiles={50}
                maxFileSize={100 * 1024 * 1024} // 100MB
              />
            </div>
          )}

          {/* Step 2: Metadata Configuration */}
          {uploadStep === 'metadata' && (
            <div className="h-full flex flex-col">
              {/* Smart Product Linking Panel */}
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Smart Product Linking</h3>
                  <div className="text-sm text-gray-500">
                    {Object.keys(productLinks).length} of {selectedFiles.length} assets linked
                  </div>
                </div>
                
                <div className="grid gap-4">
                  {selectedFiles.slice(0, 3).map((asset) => ( // Show suggestions for first 3 assets
                    <ProductLinkSuggestions
                      key={asset.id}
                      filename={asset.filename}
                      availableProducts={availableProducts}
                      onLinkProduct={(productId, linkContext, confidence) => 
                        handleLinkProduct(asset.id, productId, linkContext, confidence)
                      }
                      onSkipSuggestions={() => handleSkipProductLinking(asset.id)}
                    />
                  ))}
                  
                  {selectedFiles.length > 3 && (
                    <div className="text-center p-4 border border-border rounded-lg bg-gray-50">
                      <div className="text-sm text-gray-600 mb-2">
                        + {selectedFiles.length - 3} more assets will be analyzed for product linking
                      </div>
                      <div className="text-xs text-gray-500">
                        Complete metadata for all assets to see additional suggestions
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Asset Metadata Table */}
              <AssetMetadataTable 
                assets={selectedFiles}
                onAssetUpdate={handleAssetUpdate}
                onBulkUpdate={handleBulkUpdate}
                className="flex-1 min-h-0"
              />

              <div className="flex justify-center mt-4">
                <Button 
                  variant="outline"
                  onClick={handleBackToSelect}
                  className="mr-4"
                >
                  ← Back to File Selection
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Upload Progress */}
          {uploadStep === 'uploading' && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <LoadingSpinner size="lg" color="primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Processing Uploads</h2>
                <p className="text-muted-foreground">
                  Your assets are being uploaded and processed. This may take a few moments.
                </p>
              </div>

              <div className="space-y-3">
                {selectedFiles.map((fileData) => {
                  const progress = uploadProgress[fileData.id] || 0;
                  const hasError = uploadErrors[fileData.id];
                  
                  return (
                    <div key={fileData.id} className="flex items-center gap-4 p-3 bg-card rounded-lg border">
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        {fileData.preview ? (
                          <img src={fileData.preview} alt="" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <span className="text-lg">📄</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium truncate">{fileData.file.name}</h4>
                          <span className="text-sm text-muted-foreground">
                            {hasError ? 'Failed' : progress === 100 ? 'Complete' : progress === -1 ? 'Error' : `${progress}%`}
                          </span>
                        </div>
                        
                        {hasError ? (
                          <p className="text-sm text-red-600 truncate">{hasError}</p>
                        ) : (
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${Math.max(0, progress)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Upload Complete */}
          {uploadStep === 'complete' && (
            <div className="max-w-2xl mx-auto text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              
              <h2 className="text-xl font-semibold mb-2">Upload Complete!</h2>
              
              <p className="text-muted-foreground mb-6">
                {Object.values(uploadErrors).length === 0 
                  ? `All ${selectedFiles.length} assets have been successfully uploaded and are now available in your library.`
                  : `${selectedFiles.length - Object.values(uploadErrors).length} of ${selectedFiles.length} assets uploaded successfully.`
                }
              </p>

              <div className="flex justify-center gap-4">
                <Button onClick={handleReturnToAssets}>
                  View Assets Library
                </Button>
                
                {Object.values(uploadErrors).length > 0 && (
                  <Button variant="outline" onClick={handleBackToSelect}>
                    Upload More Files
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
