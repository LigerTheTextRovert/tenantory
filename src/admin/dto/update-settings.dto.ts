import { IsObject, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
}
