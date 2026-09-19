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
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { StockLevel } from './inventory/entities/stock-level.entity';
import { AuthModule } from './auth/auth.module';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { S3Client } from '@aws-sdk/client-s3';
import { MediaModule } from './media/media.module';
import { AppLoggerModule } from './logger/app-logger.module';
import { AdminModule } from './admin/admin.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrometheusModule } from './prometheus/prometheus.module';
import { HttpMetricsMiddleware } from './prometheus/http-metrics.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    RedisModule,
    EventEmitterModule.forRoot({ global: true }),
    AwsSdkModule.register({
      isGlobal: true,
      client: new S3Client({
        region: 'us-east-1',
        endpoint:
          process.env.MINIO_ENDPOINT ||
          `http://localhost:${process.env.MINIO_API_PORT || 9000}`,
        credentials: {
          accessKeyId: process.env.MINIO_ROOT_USER || 'tenantory_minio_user',
          secretAccessKey:
            process.env.MINIO_ROOT_PASSWORD || 'tenantory_minio_pass',
        },
        forcePathStyle: true,
      }),
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

        extra: {
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },

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
    MediaModule,
    AdminModule,
    AuditModule,
    SearchModule,
    NotificationsModule,
    AppLoggerModule,
    PrometheusModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Registered first so the duration metric covers the entire in-app
    // request lifetime: middleware (incl. tenant resolution), guards,
    // handlers, serialization — plus unmatched (404) and 5xx responses.
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');

    consumer.apply(RequestIdMiddleware).forRoutes('*');

    // Metrics scraping is unauthenticated and tenant-agnostic — it must not
    // pass through TenantMiddleware (or the global TenantGuard, bypassed via
    // @Public() on the controller).
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'v1/tenants', method: RequestMethod.ALL },
        { path: 'v1/tenants/(.*)', method: RequestMethod.ALL },
        { path: 'v1/prometheus', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
