import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getClientToken } from 'aws-sdk-v3-nest';

import { MediaService } from './media.service';
import { MediaAsset, MediaType } from './entities/media-asset.entity';

// Mock getSignedUrl from S3 presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('MediaService', () => {
  let service: MediaService;
  let mediaRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let s3Client: {
    send: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const TENANT_ID = 't1234567-e5f6-7890-abcd-ef1234567890';
  const BUCKET_NAME = 'tenantory-media-bucket';

  beforeEach(async () => {
    mediaRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    s3Client = {
      send: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MINIO_BUCKET_NAME') return BUCKET_NAME;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(MediaAsset), useValue: mediaRepo },
        { provide: getClientToken(S3Client), useValue: s3Client },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set bucketName from ConfigService', () => {
      expect(service.bucketName).toBe(BUCKET_NAME);
    });
  });

  describe('uploadFile', () => {
    const mockFile = {
      originalname: 'logo.png',
      buffer: Buffer.from('test-buffer'),
      mimetype: 'image/png',
      size: 1024,
    } as Express.Multer.File;

    it('should successfully upload file to S3 and save to DB', async () => {
      s3Client.send.mockResolvedValue(undefined);

      const mockAsset = {
        id: 'asset123',
        tenantId: TENANT_ID,
        fileName: 'unique-key-logo.png',
        originalFileName: 'logo.png',
        sizeBytes: '1024',
        mimeType: 'image/png',
        url: 'minio://tenantory-media/unique-key-logo.png',
        mediaType: MediaType.IMAGE,
      } as unknown as MediaAsset;

      mediaRepo.create.mockReturnValue(mockAsset);
      mediaRepo.save.mockResolvedValue(mockAsset);

      const result = await service.uploadFile(TENANT_ID, mockFile);

      expect(s3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      expect(mediaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          originalFileName: 'logo.png',
          sizeBytes: '1024',
          mimeType: 'image/png',
          mediaType: MediaType.IMAGE,
        }),
      );
      expect(mediaRepo.save).toHaveBeenCalledWith(mockAsset);
      expect(result).toBe(mockAsset);
    });

    it('should determine media type correctly for multiple mime types', async () => {
      s3Client.send.mockResolvedValue(undefined);

      const files = [
        { mimetype: 'image/jpeg', expected: MediaType.IMAGE },
        { mimetype: 'video/mp4', expected: MediaType.VIDEO },
        { mimetype: 'audio/mpeg', expected: MediaType.AUDIO },
        { mimetype: 'application/pdf', expected: MediaType.DOCUMENT },
        { mimetype: 'application/octet-stream', expected: MediaType.OTHER },
      ];

      for (const f of files) {
        const file = {
          originalname: 'file',
          buffer: Buffer.from(''),
          mimetype: f.mimetype,
          size: 10,
        } as Express.Multer.File;

        mediaRepo.create.mockReturnValue({});
        await service.uploadFile(TENANT_ID, file);

        expect(mediaRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            mediaType: f.expected,
          }),
        );
      }
    });

    it('should throw InternalServerErrorException if S3 upload fails', async () => {
      const s3Error = new Error('S3 Connection Timeout');
      s3Client.send.mockRejectedValue(s3Error);

      await expect(service.uploadFile(TENANT_ID, mockFile)).rejects.toThrow(
        new InternalServerErrorException({
          message: 'Failed to upload file to S3',
          error: 'S3 Connection Timeout',
        }),
      );

      expect(mediaRepo.create).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getSignedURL', () => {
    it('should return signed URL for existing asset', async () => {
      const key = 'test-key.jpg';
      const mockAsset = {
        id: 'asset123',
        tenantId: TENANT_ID,
        fileName: key,
      } as unknown as MediaAsset;

      mediaRepo.findOne.mockResolvedValue(mockAsset);
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed-url.com/test-key.jpg',
      );

      const result = await service.getSignedURL(TENANT_ID, key);

      expect(mediaRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, fileName: key },
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        s3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
      expect(result).toBe('https://signed-url.com/test-key.jpg');
    });

    it('should throw NotFoundException if asset not found in DB', async () => {
      mediaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSignedURL(TENANT_ID, 'missing-key.jpg'),
      ).rejects.toThrow(
        new NotFoundException('Media asset not found or access denied.'),
      );

      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('generatePresignedURL', () => {
    it('should generate pre-signed PutObject URL and return URL and key', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed-upload-url.com/upload-key',
      );

      const result = await service.generatePresignedURL(
        TENANT_ID,
        'file.png',
        'image/png',
      );

      expect(getSignedUrl).toHaveBeenCalledWith(
        s3Client,
        expect.any(PutObjectCommand),
        { expiresIn: 3600 },
      );
      expect(result.url).toBe('https://signed-upload-url.com/upload-key');
      expect(result.key).toContain(TENANT_ID);
      expect(result.key.endsWith('.png')).toBe(true);
    });
  });
});
