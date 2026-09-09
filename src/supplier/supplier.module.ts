import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { AuditModule } from '../audit/audit.module';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), AuditModule],
  providers: [SupplierService],
  controllers: [SupplierController],
  exports: [TypeOrmModule],
})
export class SupplierModule {}
