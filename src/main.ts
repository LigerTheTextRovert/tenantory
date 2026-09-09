import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AuditContextInterceptor } from './audit/audit-context.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { setupSwagger } from './config/swagger.config';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });
	app.useLogger(app.get(Logger));

	app.setGlobalPrefix('api');
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);

	app.enableVersioning({
		type: VersioningType.URI,
		defaultVersion: '1',
	});

	app.useGlobalGuards(app.get(TenantGuard));
	app.useGlobalInterceptors(app.get(TenantInterceptor));
	app.useGlobalInterceptors(app.get(AuditContextInterceptor));
	app.useGlobalFilters(new GlobalExceptionFilter());

	setupSwagger(app);

	await app.listen(process.env.APP_PORT ?? process.env.PORT ?? 3000);
}
void bootstrap();
