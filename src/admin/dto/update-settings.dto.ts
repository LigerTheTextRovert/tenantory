import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({
    example: { currency: 'USD', theme: 'dark' },
    description: 'A JSON object containing tenant specific settings',
    required: false,
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
}
