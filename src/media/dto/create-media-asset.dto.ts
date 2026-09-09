import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MediaType } from '../entities/media-asset.entity';

export class CreateMediaAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFileName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  mimeType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  sizeBytes: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url: string;

  @IsEnum(MediaType)
  mediaType: MediaType;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  altText?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
