import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { Category } from './entities/category.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Category]), AuditModule],
	providers: [CategoryService],
	controllers: [CategoryController],
	exports: [TypeOrmModule, CategoryService],
})
export class CategoryModule {}
