import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
	@ApiProperty({
		example: { currency: 'USD', theme: 'dark' },
		description: 'A JSON object containing tenant specific settings',
		required: false,
	})
	@IsObject()
	@IsOptional()
	config?: Record<string, unknown>;
}
