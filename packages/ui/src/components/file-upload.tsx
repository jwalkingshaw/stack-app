'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileIcon, Loader2 } from 'lucide-react';
import { Button } from './button';
import { formatFileSize } from '../lib/utils';
import type { FileUploadProgress } from '@tradetool/types';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  onUploadProgress?: (progress: FileUploadProgress[]) => void;
  maxFileSize?: number;
  maxFiles?: number;
  acceptedFileTypes?: string[];
  disabled?: boolean;
}

export function FileUpload({
  onFilesSelected,
  onUploadProgress,
  maxFileSize = 100 * 1024 * 1024, // 100MB
  maxFiles = 10,
  acceptedFileTypes,
  disabled = false,
}: FileUploadProps) {
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (acceptedFiles.length > 0) {
      onFilesSelected(acceptedFiles);
      
      // Initialize progress tracking
      const initialProgress: FileUploadProgress[] = acceptedFiles.map(file => ({
        filename: file.name,
        progress: 0,
        status: 'pending',
      }));
      
      setUploadProgress(initialProgress);
      onUploadProgress?.(initialProgress);
    }

    if (rejectedFiles.length > 0) {
      console.warn('Rejected files:', rejectedFiles);
    }
  }, [onFilesSelected, onUploadProgress]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
  } = useDropzone({
    onDrop,
    maxFiles,
    maxSize: maxFileSize,
    accept: acceptedFileTypes ? 
      acceptedFileTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}) : 
      undefined,
    disabled,
  });

  const removeFile = (index: number) => {
    setUploadProgress(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
          ${isDragActive && !isDragReject ? 'border-primary bg-primary/10' : ''}
          ${isDragReject ? 'border-destructive bg-destructive/10' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'}
          ${!isDragActive && !isDragReject ? 'border-border' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-2">
          <Upload className="w-12 h-12 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium text-foreground">
              {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse • Max {formatFileSize(maxFileSize)} per file
            </p>
          </div>
        </div>
      </div>

      {uploadProgress.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">Upload Progress</h3>
          {uploadProgress.map((file, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 bg-card rounded-lg border shadow-soft">
              <div className="flex-shrink-0">
                {file.status === 'uploading' || file.status === 'processing' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : file.status === 'completed' ? (
                  <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground text-xs">✓</span>
                  </div>
                ) : file.status === 'error' ? (
                  <div className="w-5 h-5 bg-destructive rounded-full flex items-center justify-center">
                    <span className="text-destructive-foreground text-xs">✗</span>
                  </div>
                ) : (
                  <FileIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {file.filename}
                </p>
                <div className="mt-1">
                  <div className="bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        file.status === 'error' ? 'bg-destructive' :
                        file.status === 'completed' ? 'bg-primary' : 'bg-primary'
                      }`}
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {file.status === 'error' && file.error ? file.error :
                     file.status === 'completed' ? 'Upload complete' :
                     file.status === 'processing' ? 'Processing...' :
                     file.status === 'uploading' ? `${file.progress}%` : 'Pending'}
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                className="flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}