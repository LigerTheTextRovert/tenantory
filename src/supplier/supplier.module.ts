import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Supplier } from './entities/supplier.entity';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

@Module({
	imports: [TypeOrmModule.forFeature([Supplier]), AuditModule],
	providers: [SupplierService],
	controllers: [SupplierController],
	exports: [TypeOrmModule],
})
export class SupplierModule {}
