import { S3Client } from '@aws-sdk/client-s3';
import {
	type MiddlewareConsumer,
	Module,
	type NestModule,
	RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CategoryModule } from './category/category.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { StockLevel } from './inventory/entities/stock-level.entity';
import { InventoryModule } from './inventory/inventory.module';
import { AppLoggerModule } from './logger/app-logger.module';
import { MediaModule } from './media/media.module';
import { RedisModule } from './redis/redis.module';
import { SupplierModule } from './supplier/supplier.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { TenantModule } from './tenant/tenant.module';
import { WarehouseModule } from './warehouse/warehouse.module';

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
				endpoint: 'http://localhost:9000',
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
		AppLoggerModule,
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
