import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { MediaAsset, MediaType } from './entities/media-asset.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectAws } from 'aws-sdk-v3-nest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { generateUniqueKey } from '../common/utils/s3-unique-key.util';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaService {
  bucketName: string;

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    @InjectAws(S3Client) private readonly s3client: S3Client,
    private readonly configServcie: ConfigService,
  ) {
    this.bucketName = configServcie.get('MINIO_BUCKET_NAME');
  }

  async uploadFile(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<MediaAsset> {
    const key = generateUniqueKey(tenantId, file.originalname);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      // 1. Upload to S3 first
      await this.s3client.send(command);
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        'Failed to upload file to S3, error:',
        error,
      );
    }

    // 2. ONLY save to DB if S3 upload succeeds
    const asset = this.mediaRepo.create({
      tenantId,
      fileName: key,
      originalFileName: file.originalname,
      sizeBytes: String(file.size),
      mimeType: file.mimetype,
      url: `minio://tenantory-media/${key}`,
      mediaType: this.getMediaTypeFromMimeType(file.mimetype),
    });

    return this.mediaRepo.save(asset);
  }

  async getSignedURL(tenantId: string, key: string): Promise<string> {
    const asset = await this.mediaRepo.findOne({
      where: { tenantId, fileName: key },
    });

    if (!asset) {
      throw new NotFoundException('Media asset not found or access denied.');
    }

    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.bucketName,
    });

    return getSignedUrl(this.s3client, command, { expiresIn: 3600 });
  }

  async generatePresignedURL(
    tenantId: string,
    fileName: string,
    contentType: string,
  ): Promise<{ url: string; key: string }> {
    const key = generateUniqueKey(tenantId, fileName);
    const command = new PutObjectCommand({
      Key: key,
      Bucket: this.bucketName,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.s3client, command, { expiresIn: 3600 });

    return { url, key };
  }

  private getMediaTypeFromMimeType(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) {
      return MediaType.IMAGE;
    }
    if (mimeType.startsWith('video/')) {
      return MediaType.VIDEO;
    }
    if (mimeType.startsWith('audio/')) {
      return MediaType.AUDIO;
    }
    if (mimeType.startsWith('application/')) {
      // Check for document types
      const documentTypes = [
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
        'txt',
        'rtf',
      ];
      if (documentTypes.some((type) => mimeType.includes(type))) {
        return MediaType.DOCUMENT;
      }
    }
    return MediaType.OTHER;
  }
}
