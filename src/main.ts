import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { AuditContextInterceptor } from './audit/audit-context.interceptor';
import { setupSwagger } from './config/swagger.config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { Logger } from 'nestjs-pino';

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
