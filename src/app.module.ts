import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantModule } from './tenant/tenant.module';
import { CategoryModule } from './category/category.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SupplierModule } from './supplier/supplier.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { dataSourceOption } from './config/db.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOption, autoLoadEntities: true }),
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    TenantModule,
    CategoryModule,
    CatalogModule,
    InventoryModule,
    WarehouseModule,
    SupplierModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
