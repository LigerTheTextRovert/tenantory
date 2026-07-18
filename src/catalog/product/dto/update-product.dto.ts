import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * All fields optional for partial update.
 *
 * NOTE: skuPrefix should NOT be changed after creation since existing
 * variant SKUs are constructed from it. The service layer enforces
 * this by throwing ConflictException on skuPrefix changes.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
