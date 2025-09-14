"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Upload, 
  X, 
  Check, 
  AlertCircle, 
  Image as ImageIcon,
  Video,
  FileText,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Asset upload states
type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

interface AssetUpload {
  id: string;
  file: File;
  preview?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  metadata?: {
    name: string;
    tags: string[];
    assetType: 'marketing' | 'product' | 'brand';
  };
}

export default function ModernUploadPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;
  
  // State
  const [assets, setAssets] = useState<AssetUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragging to false if leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFilesAdded(files);
  }, []);

  // File handling
  const handleFilesAdded = useCallback((files: File[]) => {
    console.log('🎯 Files added:', files);
    
    const newAssets: AssetUpload[] = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      file,
      status: 'pending',
      progress: 0,
      metadata: {
        name: file.name.split('.').slice(0, -1).join('.'),
        tags: [],
        assetType: 'uncategorized' as any
      }
    }));

    // Generate previews for images
    newAssets.forEach(asset => {
      if (asset.file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAssets(prev => prev.map(a => 
            a.id === asset.id 
              ? { ...a, preview: reader.result as string }
              : a
          ));
        };
        reader.readAsDataURL(asset.file);
      }
    });

    setAssets(prev => [...prev, ...newAssets]);
    
    // Auto-start upload after a brief delay for UX
    setTimeout(() => startUploading(newAssets), 300);
  }, []);

  // Smart asset type detection
  const getAssetTypeFromFile = (file: File): 'marketing' | 'product' | 'brand' => {
    const name = file.name.toLowerCase();
    
    if (name.includes('logo') || name.includes('brand') || name.includes('guideline')) {
      return 'brand';
    }
    if (name.includes('product') || name.includes('render') || name.includes('packshot')) {
      return 'product';
    }
    return 'marketing'; // Default
  };

  // Upload processing
  const startUploading = useCallback(async (assetsToUpload: AssetUpload[]) => {
    setIsUploading(true);
    
    for (const asset of assetsToUpload) {
      try {
        // Update to uploading status
        setAssets(prev => prev.map(a => 
          a.id === asset.id 
            ? { ...a, status: 'uploading' as UploadStatus }
            : a
        ));

        await uploadAsset(asset);
        
        // Mark as completed
        setAssets(prev => prev.map(a => 
          a.id === asset.id 
            ? { ...a, status: 'completed' as UploadStatus, progress: 100 }
            : a
        ));
        
      } catch (error) {
        console.error('Upload failed:', error);
        setAssets(prev => prev.map(a => 
          a.id === asset.id 
            ? { ...a, status: 'failed' as UploadStatus, error: String(error) }
            : a
        ));
      }
    }
    
    setIsUploading(false);
  }, [tenantSlug]);

  const uploadAsset = async (asset: AssetUpload) => {
    try {
      const formData = new FormData();
      formData.append('file', asset.file);
      formData.append('metadata', JSON.stringify({
        tags: asset.metadata?.tags || []
      }));

      const response = await fetch(`/api/${tenantSlug}/assets/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Upload failed';
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = `Upload failed (${response.status})`;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Upload successful:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  };

  // File input handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFilesAdded(files);
    }
  }, [handleFilesAdded]);

  // Remove asset
  const removeAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
  }, []);

  // Get file icon
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return ImageIcon;
    if (file.type.startsWith('video/')) return Video;
    return FileText;
  };

  // Get status icon
  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case 'uploading': return Loader2;
      case 'completed': return Check;
      case 'failed': return AlertCircle;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${tenantSlug}/assets`)}
              className="text-gray-600"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assets
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Upload Assets</h1>
              <p className="text-gray-600">Drag and drop files anywhere to get started</p>
            </div>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ease-in-out",
            isDragging 
              ? "border-blue-400 bg-blue-50 scale-[1.02]" 
              : "border-input bg-white hover:border-muted-foreground hover:bg-gray-50"
          )}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <div className="text-blue-600 font-medium text-lg">
                Drop files here to upload
              </div>
            </div>
          )}
          
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Upload your assets
          </h3>
          <p className="text-gray-600 mb-6">
            Drag and drop files here, or click to browse
          </p>
          
          <input
            type="file"
            multiple
            accept="image/*,video/*,.pdf"
            onChange={handleFileInputChange}
            className="hidden"
            id="file-input"
          />
          <Button 
            onClick={() => document.getElementById('file-input')?.click()}
            className="cursor-pointer"
          >
            Choose Files
          </Button>
          
          <div className="mt-4 text-sm text-gray-500">
            Supports: Images, Videos, PDFs • Max 100MB per file
          </div>
        </div>

        {/* Assets Grid */}
        {assets.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Assets ({assets.length})
              </h2>
              <div className="text-sm text-gray-600">
                {assets.filter(a => a.status === 'completed').length} completed • 
                {assets.filter(a => a.status === 'failed').length} failed
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => {
                const FileIcon = getFileIcon(asset.file);
                const StatusIcon = getStatusIcon(asset.status);
                
                return (
                  <div
                    key={asset.id}
                    className={cn(
                      "relative bg-white rounded-lg border p-4 transition-all duration-200",
                      asset.status === 'completed' && "border-green-200 bg-green-50",
                      asset.status === 'failed' && "border-red-200 bg-red-50",
                      asset.status === 'uploading' && "border-blue-200 bg-blue-50"
                    )}
                  >
                    {/* Remove button */}
                    <button
                      onClick={() => removeAsset(asset.id)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-600" />
                    </button>

                    {/* Preview or icon */}
                    <div className="mb-3">
                      {asset.preview ? (
                        <img
                          src={asset.preview}
                          alt={asset.file.name}
                          className="w-full h-32 object-cover rounded-md"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-100 rounded-md flex items-center justify-center">
                          <FileIcon className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* File info */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900 truncate">
                          {asset.metadata?.name || asset.file.name}
                        </h3>
                        {StatusIcon && (
                          <StatusIcon className={cn(
                            "w-5 h-5",
                            asset.status === 'uploading' && "animate-spin text-blue-600",
                            asset.status === 'completed' && "text-green-600",
                            asset.status === 'failed' && "text-red-600"
                          )} />
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600">
                        {(asset.file.size / 1024 / 1024).toFixed(1)}MB • {asset.file.type.split('/')[0]}
                      </div>

                      {/* Progress bar */}
                      {asset.status === 'uploading' && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${asset.progress}%` }}
                          />
                        </div>
                      )}

                      {/* Error message */}
                      {asset.status === 'failed' && asset.error && (
                        <div className="text-sm text-red-600 mt-1">
                          {asset.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next steps hint */}
        {assets.length > 0 && assets.some(a => a.status === 'completed') && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-blue-800 font-medium mb-2">
              🎉 Assets uploaded successfully!
            </p>
            <p className="text-blue-700 text-sm mb-3">
              You can now organize, tag, and link them to products.
            </p>
            <Button
              onClick={() => router.push(`/${tenantSlug}/assets`)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              View All Assets
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}