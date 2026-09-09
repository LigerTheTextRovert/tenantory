import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1 (GET) serves the root controller', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World! this is my first project in nest.js :D');
  });

  it('/api/v1/tenants (GET) is reachable without tenant context', () => {
    return request(app.getHttpServer()).get('/api/v1/tenants').expect(200);
  });

  it('/api/v1/categories (GET) without X-Tenant-ID is rejected by the tenant middleware', () => {
    return request(app.getHttpServer()).get('/api/v1/categories').expect(400);
  });
});
