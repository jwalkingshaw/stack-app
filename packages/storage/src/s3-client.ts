import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Service {
  private client: S3Client;
  private bucketName: string;
  private region: string;

  constructor() {
    this.region =
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'us-east-1';
    console.log('🔧 S3Service - Environment check:', {
      AWS_REGION: process.env.AWS_REGION,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '***SET***' : 'MISSING',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'MISSING',
      AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
      AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    });
    
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    // Try both environment variable names
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET!;
    console.log('🔧 S3Service - Using bucket:', this.bucketName);
  }

  async getPresignedUploadUrl(
    key: string, 
    contentType: string, 
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async getPresignedDownloadUrl(
    key: string, 
    expiresIn: number = 3600,
    options?: {
      filename?: string;
      contentType?: string;
      forceDownload?: boolean;
    }
  ): Promise<string> {
    const forceDownload = options?.forceDownload ?? false;
    const safeFilename = options?.filename?.replace(/["\r\n]/g, "_");
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition:
        forceDownload && safeFilename
          ? `attachment; filename="${safeFilename}"`
          : forceDownload
            ? "attachment"
            : undefined,
      ResponseContentType: options?.contentType || undefined,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  async uploadObject(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
  }

  generateAssetKey(organizationId: string, filename: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = filename.split('.').pop();
    return `organizations/${organizationId}/assets/${timestamp}-${randomSuffix}.${extension}`;
  }

  generateThumbnailKey(assetKey: string, size: 'small' | 'medium' | 'large'): string {
    const extension = assetKey.split('.').pop();
    const basePath = assetKey.substring(0, assetKey.lastIndexOf('.'));
    return `${basePath}-thumb-${size}.${extension}`;
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}


