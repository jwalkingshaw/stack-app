import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEBUG_S3_SERVICE = process.env.DEBUG_S3_SERVICE === '1';

export class S3Service {
  private static sharedClient: S3Client | null = null;
  private static sharedBucketName: string | null = null;
  private static sharedRegion: string | null = null;
  private static hasLoggedConfig = false;

  private client: S3Client;
  private bucketName: string;
  private region: string;
  private cloudFrontDomain: string | null;

  constructor() {
    if (!S3Service.sharedClient || !S3Service.sharedBucketName || !S3Service.sharedRegion) {
      const region =
        process.env.AWS_REGION ||
        process.env.AWS_DEFAULT_REGION ||
        'us-east-1';
      const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

      if (!bucketName) {
        throw new Error('S3 bucket is not configured (AWS_S3_BUCKET_NAME or AWS_S3_BUCKET required)');
      }
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials are not configured (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY required)');
      }

      S3Service.sharedClient = new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      S3Service.sharedBucketName = bucketName;
      S3Service.sharedRegion = region;

      if (DEBUG_S3_SERVICE && !S3Service.hasLoggedConfig) {
        console.log('S3Service config:', {
          AWS_REGION: process.env.AWS_REGION,
          AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
          AWS_ACCESS_KEY_ID: '***SET***',
          AWS_SECRET_ACCESS_KEY: '***SET***',
          AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
          AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
          AWS_CLOUDFRONT_DOMAIN: process.env.AWS_CLOUDFRONT_DOMAIN,
        });
        S3Service.hasLoggedConfig = true;
      }
    }

    this.client = S3Service.sharedClient!;
    this.bucketName = S3Service.sharedBucketName!;
    this.region = S3Service.sharedRegion!;
    this.cloudFrontDomain = this.normalizeCloudFrontDomain(process.env.AWS_CLOUDFRONT_DOMAIN);
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
    const safeFilename = options?.filename?.replace(/["\r\n]/g, '_');
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition:
        forceDownload && safeFilename
          ? `attachment; filename="${safeFilename}"`
          : forceDownload
            ? 'attachment'
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
    const normalizedKey = key.replace(/^\/+/, '');
    if (this.cloudFrontDomain) {
      return `https://${this.cloudFrontDomain}/${normalizedKey}`;
    }
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${normalizedKey}`;
  }

  private normalizeCloudFrontDomain(domain: string | undefined): string | null {
    if (!domain) return null;
    const trimmed = domain.trim();
    if (!trimmed) return null;
    return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}
