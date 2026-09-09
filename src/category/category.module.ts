import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { AuditModule } from '../audit/audit.module';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category]), AuditModule],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [TypeOrmModule, CategoryService],
})
export class CategoryModule {}
