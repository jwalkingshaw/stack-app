import sharp, { type Sharp } from 'sharp';
import { S3Service } from './s3-client';

type ThumbnailMap = { small?: string; medium?: string; large?: string };
type ThumbnailSize = 'small' | 'medium' | 'large';

const IMAGE_SIZES: Record<ThumbnailSize, number> = {
  small: 320,
  medium: 640,
  large: 1280,
};

type SharpOutputFormat = 'jpeg' | 'png' | 'webp';

export class ThumbnailService {
  constructor(private s3Service: S3Service) {}

  async generateThumbnails(
    originalKey: string,
    contentType: string,
    fileBuffer?: ArrayBuffer | Buffer | Uint8Array
  ): Promise<ThumbnailMap> {
    const thumbnails: ThumbnailMap = {};

    if (this.isImageType(contentType)) {
      if (!fileBuffer) {
        console.warn(
          '[ThumbnailService] Missing file buffer for image thumbnail generation:',
          originalKey
        );
        return thumbnails;
      }

      return this.generateImageThumbnails(originalKey, contentType, fileBuffer);
    }

    if (this.isVideoType(contentType)) {
      thumbnails.small = '/api/placeholder/video-thumb-small';
      thumbnails.medium = '/api/placeholder/video-thumb-medium';
      thumbnails.large = '/api/placeholder/video-thumb-large';
      return thumbnails;
    }

    if (this.isDocumentType(contentType)) {
      thumbnails.small = '/api/placeholder/doc-thumb-small';
      thumbnails.medium = '/api/placeholder/doc-thumb-medium';
      thumbnails.large = '/api/placeholder/doc-thumb-large';
    }

    return thumbnails;
  }

  private async generateImageThumbnails(
    originalKey: string,
    contentType: string,
    fileBuffer: ArrayBuffer | Buffer | Uint8Array
  ): Promise<ThumbnailMap> {
    const buffer = Buffer.isBuffer(fileBuffer)
      ? fileBuffer
      : Buffer.from(
          fileBuffer instanceof ArrayBuffer ? new Uint8Array(fileBuffer) : fileBuffer
        );

    const baseImage = sharp(buffer).rotate();
    const format = this.getOutputFormat(contentType);
    const mimeType = this.getMimeTypeForFormat(format);
    const thumbnails: ThumbnailMap = {};

    await Promise.all(
      (Object.entries(IMAGE_SIZES) as Array<[ThumbnailSize, number]>).map(
        async ([sizeLabel, maxDimension]) => {
          const resized = await this.applyFormat(
            baseImage
              .clone()
              .resize({
                width: maxDimension,
                height: maxDimension,
                fit: 'inside',
                withoutEnlargement: true,
                fastShrinkOnLoad: true,
              }),
            format
          ).toBuffer();

          const thumbKey = this.s3Service.generateThumbnailKey(
            originalKey,
            sizeLabel
          );
          await this.s3Service.uploadObject(thumbKey, resized, mimeType);
          thumbnails[sizeLabel] = this.s3Service.getPublicUrl(thumbKey);
        }
      )
    );

    return thumbnails;
  }

  private isImageType(contentType: string): boolean {
    if (!contentType.startsWith('image/')) return false;
    const unsupported = ['image/svg+xml', 'image/gif'];
    return !unsupported.includes(contentType);
  }

  private isVideoType(contentType: string): boolean {
    return contentType.startsWith('video/');
  }

  private isDocumentType(contentType: string): boolean {
    return (
      contentType.includes('pdf') ||
      contentType.includes('document') ||
      contentType.includes('spreadsheet') ||
      contentType.includes('presentation')
    );
  }

  async deleteThumbnails(originalKey: string): Promise<void> {
    try {
      const sizes: ThumbnailSize[] = ['small', 'medium', 'large'];

      await Promise.all(
        sizes.map(async (size) => {
          const thumbKey = this.s3Service.generateThumbnailKey(
            originalKey,
            size
          );
          try {
            await this.s3Service.deleteObject(thumbKey);
          } catch (error) {
            console.warn(`Could not delete thumbnail ${thumbKey}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error deleting thumbnails:', error);
      throw error;
    }
  }

  private getOutputFormat(contentType: string): SharpOutputFormat {
    if (contentType === 'image/png' || contentType === 'image/svg+xml') {
      return 'png';
    }
    if (contentType === 'image/webp') {
      return 'webp';
    }
    return 'jpeg';
  }

  private getMimeTypeForFormat(format: SharpOutputFormat): string {
    switch (format) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  private applyFormat(image: Sharp, format: SharpOutputFormat): Sharp {
    switch (format) {
      case 'png':
        return image.png({ quality: 85, compressionLevel: 8 });
      case 'webp':
        return image.webp({ quality: 80 });
      default:
        return image.jpeg({ quality: 82 });
    }
  }
}
