import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { CategoryModule } from '../category/category.module';
import { ProductService } from './product/product.service';
import { ProductController } from './product/product.controller';
import { VariantService } from './variant/variant.service';
import { VariantController } from './variant/variant.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant]),
    CategoryModule,
  ],
  providers: [ProductService, VariantService],
  controllers: [ProductController, VariantController],
  exports: [TypeOrmModule, ProductService, VariantService],
})
export class CatalogModule {}
