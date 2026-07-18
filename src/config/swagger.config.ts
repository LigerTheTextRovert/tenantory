import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Tenantory')
    .setDescription(
      'Multi-Tenant E-Commerce Inventory & Catalog Management API.\n\n' +
        '**Tenant Isolation:** Every request must include the `X-Tenant-Id` header.',
    )
    .setVersion('1.0')
    .addApiKey(
      { type: 'apiKey', name: 'X-Tenant-Id', in: 'header' },
      'X-Tenant-Id',
    )
    .addTag('Categories', 'Manage hierarchical product categories per tenant')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
