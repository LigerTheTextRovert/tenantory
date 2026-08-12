import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { Express } from 'express';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':key')
  async getAsset(
    @TenantDecorator() tenantId: string,
    @Param('key') key: string,
  ) {
    const url = await this.mediaService.getSignedURL(tenantId, key);
    return { url };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @TenantDecorator() tenantId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.mediaService.uploadFile(tenantId, file);
  }

  @Post('presigned-url')
  async generatePresignedUrl(
    @TenantDecorator() tenantId: string,
    @Body('fileName') fileName: string,
    @Body('contentType') contentType: string,
  ) {
    return this.mediaService.generatePresignedURL(
      tenantId,
      fileName,
      contentType,
    );
  }
}
