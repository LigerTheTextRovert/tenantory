import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  @Min(1)
  @Max(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Max(150)
  slug?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
