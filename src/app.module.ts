import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantModule } from './tenant/tenant.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SupplierModule } from './supplier/supplier.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { dataSourceOption } from './config/db.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOption),
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    TenantModule,
    CatalogModule,
    InventoryModule,
    WarehouseModule,
    SupplierModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
