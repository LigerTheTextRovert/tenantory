import {
	Body,
	Controller,
	Get,
	MaxFileSizeValidator,
	Param,
	ParseFilePipe,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import type { Express } from 'express';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import type { MediaService } from './media.service';

@ApiTags('Media')
@Controller('media')
export class MediaController {
	constructor(private readonly mediaService: MediaService) {}

	@Get(':key')
	@ApiOperation({ summary: 'Get a signed URL for a media asset' })
	@ApiParam({ name: 'key', description: 'The unique key of the media asset' })
	@ApiResponse({
		status: 200,
		description: 'Signed URL generated successfully',
	})
	@ApiResponse({
		status: 404,
		description: 'Media asset not found or access denied',
	})
	async getAsset(
		@TenantDecorator() tenantId: string,
		@Param('key') key: string,
	) {
		const url = await this.mediaService.getSignedURL(tenantId, key);
		return { url };
	}

	@Post('upload')
	@UseInterceptors(FileInterceptor('file'))
	@ApiOperation({ summary: 'Upload a new media asset' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
			},
		},
	})
	@ApiResponse({ status: 201, description: 'File uploaded successfully' })
	@ApiResponse({ status: 500, description: 'Failed to upload file to S3' })
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
	@ApiOperation({
		summary: 'Generate a presigned URL for direct client S3 upload',
	})
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				fileName: { type: 'string', example: 'product-image.png' },
				contentType: { type: 'string', example: 'image/png' },
			},
			required: ['fileName', 'contentType'],
		},
	})
	@ApiResponse({
		status: 201,
		description: 'Presigned URL and key generated successfully',
	})
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
