import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CategoryModule } from '../category/category.module';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductController } from './product/product.controller';
import { ProductService } from './product/product.service';
import { VariantController } from './variant/variant.controller';
import { VariantService } from './variant/variant.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Product, ProductVariant]),
		CategoryModule,
		AuditModule,
	],
	providers: [ProductService, VariantService],
	controllers: [ProductController, VariantController],
	exports: [TypeOrmModule, ProductService, VariantService],
})
export class CatalogModule {}
