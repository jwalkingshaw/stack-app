import { S3Service } from './s3-client';
import type { UploadRequest, UploadResponse } from '@tradetool/types';

export class UploadService {
  constructor(
    private s3Service: S3Service,
    private organizationId: string,
    private userId: string
  ) {}

  async initializeUpload(request: UploadRequest): Promise<UploadResponse> {
    // Generate unique S3 key
    const s3Key = this.s3Service.generateAssetKey(this.organizationId, request.filename);
    
    // Get presigned upload URL
    const uploadUrl = await this.s3Service.getPresignedUploadUrl(
      s3Key,
      request.contentType,
      3600 // 1 hour expiry
    );

    // Generate temporary asset ID that will be used after upload completion
    const assetId = this.generateAssetId();

    return {
      uploadUrl,
      key: s3Key,
      assetId,
    };
  }

  async validateFileType(filename: string, contentType: string): Promise<{ valid: boolean; error?: string }> {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Videos
      'video/mp4', 'video/webm', 'video/quicktime',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    ];

    if (!allowedTypes.includes(contentType)) {
      return {
        valid: false,
        error: `File type ${contentType} is not allowed`
      };
    }

    // Check file extension matches content type
    const extension = filename.toLowerCase().split('.').pop();
    const expectedTypes: Record<string, string[]> = {
      'jpg': ['image/jpeg'],
      'jpeg': ['image/jpeg'],
      'png': ['image/png'],
      'gif': ['image/gif'],
      'webp': ['image/webp'],
      'svg': ['image/svg+xml'],
      'mp4': ['video/mp4'],
      'webm': ['video/webm'],
      'mov': ['video/quicktime'],
      'pdf': ['application/pdf'],
      'doc': ['application/msword'],
      'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'xls': ['application/vnd.ms-excel'],
      'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      'ppt': ['application/vnd.ms-powerpoint'],
      'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      'txt': ['text/plain'],
      'csv': ['text/csv'],
      'zip': ['application/zip'],
      'rar': ['application/x-rar-compressed'],
      '7z': ['application/x-7z-compressed'],
    };

    if (extension && expectedTypes[extension] && !expectedTypes[extension].includes(contentType)) {
      return {
        valid: false,
        error: `Content type ${contentType} does not match file extension .${extension}`
      };
    }

    return { valid: true };
  }

  getFileTypeCategory(contentType: string): string {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.includes('pdf') || contentType.includes('document') || 
        contentType.includes('spreadsheet') || contentType.includes('presentation') ||
        contentType.startsWith('text/')) return 'document';
    if (contentType.includes('zip') || contentType.includes('compressed')) return 'archive';
    return 'other';
  }

  private generateAssetId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}