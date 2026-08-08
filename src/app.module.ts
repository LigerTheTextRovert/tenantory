import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
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
// import { dataSourceOption } from './config/db.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { StockLevel } from './inventory/entities/stock-level.entity';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT_EXTERNAL),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,

        autoLoadEntities: true,

        synchronize: process.env.DB_SYNCHRONIZE === 'true',
        logging: process.env.NODE_ENV === 'development',

        namingStrategy: new SnakeNamingStrategy(),
        cache: true,
      }),
    }),
    TypeOrmModule.forFeature([StockLevel]),
    TenantModule,
    CategoryModule,
    CatalogModule,
    InventoryModule,
    WarehouseModule,
    SupplierModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');

    // In your app.module.ts or where you configure the middleware
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'v1/tenants', method: RequestMethod.ALL },
        { path: 'v1/tenants/(.*)', method: RequestMethod.ALL },
        // { path: 'auth/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
