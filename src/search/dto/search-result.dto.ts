import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SearchType } from '../enums/search-type.enum';
import { ProductHitDto, VariantHitDto } from './search-hit.dto';

export class SearchResultDto {
	@ApiPropertyOptional({ type: () => [ProductHitDto] })
	products?: ProductHitDto[];

	@ApiPropertyOptional({ type: () => [VariantHitDto] })
	variants?: VariantHitDto[];

	@ApiProperty({
		description: 'Entity types included in this response',
		enum: SearchType,
		example: SearchType.ALL,
	})
	type!: SearchType;
}
