import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { CategoryModule } from '../category/category.module';
import { ProductService } from './product/product.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant]),
    CategoryModule,
  ],
  providers: [ProductService],
  exports: [TypeOrmModule],
})
export class CatalogModule {}
