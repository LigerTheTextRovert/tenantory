import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), AuditModule],
  providers: [SupplierService],
  controllers: [SupplierController],
  exports: [TypeOrmModule],
})
export class SupplierModule {}
