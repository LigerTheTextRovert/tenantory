import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AuditModule } from '../src/audit/audit.module';
import { AuditService } from '../src/audit/audit.service';
import { Audit } from '../src/audit/entities/audit.entity';
import { auditAsyncStorage } from '../src/audit/audit-context';
import { AuditAction } from '../src/audit/enums/audit-action.enum';
import { AuditedEntityType } from '../src/audit/enums/audited-entity-type';
import { Tenant } from '../src/tenant/entities/tenant.entity';
import { TenantStatus } from '../src/tenant/entities/tenant.entity';
import { Category } from '../src/category/entities/category.entity';
import { User } from '../src/auth/entities/user.entity';

const TEST_DB = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT_EXTERNAL ?? 5435),
  username: process.env.DB_USERNAME ?? 'tenantory_user',
  password: process.env.DB_PASSWORD ?? 'tenantory_pass',
  database: process.env.AUDIT_TEST_DB ?? 'tenantory_audit_test',
};

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
const ACTOR_ID = 'b1111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'c1111111-1111-4111-8111-111111111111';

const TENANT_B_ID = 'a2222222-2222-4222-8222-222222222222';
const ACTOR_B_ID = 'b2222222-2222-4222-8222-222222222222';
const PRODUCT_B_ID = 'c2222222-2222-4222-8222-222222222222';

async function waitForAuditRow(
  repo: Repository<Audit>,
  entityId: string,
  timeoutMs = 2000,
): Promise<Audit | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = await repo.findOne({ where: { entityId } });
    if (row) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

describe('Audit logging (integration, real PostgreSQL)', () => {
  let auditRepo: Repository<Audit>;
  let tenantRepo: Repository<Tenant>;
  let userRepo: Repository<User>;
  let auditService: AuditService;
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...TEST_DB,
          type: 'postgres',
          entities: [Audit, Tenant, User, Category],
          autoLoadEntities: true,
          synchronize: true,
          dropSchema: true,
          namingStrategy: new SnakeNamingStrategy(),
        }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forFeature([Audit, Tenant, User, Category]),
        AuditModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    auditRepo = moduleRef.get(getRepositoryToken(Audit));
    tenantRepo = moduleRef.get(getRepositoryToken(Tenant));
    userRepo = moduleRef.get(getRepositoryToken(User));
    auditService = moduleRef.get(AuditService);

    await tenantRepo.insert({
      id: TENANT_ID,
      domainName: 'audit-test.local',
      businessName: 'Audit Test Tenant',
      status: TenantStatus.ACTIVE,
    });

    await userRepo.insert({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      email: 'actor@audit-test.local',
      firstName: 'Audit',
      lastName: 'Actor',
      passwordHash: 'not-a-real-hash',
    });

    await tenantRepo.insert({
      id: TENANT_B_ID,
      domainName: 'audit-test-b.local',
      businessName: 'Audit Test Tenant B',
      status: TenantStatus.ACTIVE,
    });

    await userRepo.insert({
      id: ACTOR_B_ID,
      tenantId: TENANT_B_ID,
      email: 'actor-b@audit-test.local',
      firstName: 'Audit',
      lastName: 'Actor B',
      passwordHash: 'not-a-real-hash',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists an audited mutation with tenant, actor, diff and metadata', async () => {
    auditAsyncStorage.run(
      {
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        requestId: 'req-int-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-integration',
      },
      () =>
        auditService.record({
          action: AuditAction.UPDATE,
          entityType: AuditedEntityType.PRODUCT,
          entityId: PRODUCT_ID,
          oldValues: { price: 10 },
          newValues: { price: 20 },
          metadata: { reason: 'price correction' },
        }),
    );

    const row = await waitForAuditRow(auditRepo, PRODUCT_ID);
    expect(row).not.toBeNull();
    expect(row!.tenantId).toBe(TENANT_ID);
    expect(row!.actorId).toBe(ACTOR_ID);
    expect(row!.action).toBe(AuditAction.UPDATE);
    expect(row!.entityType).toBe(AuditedEntityType.PRODUCT);
    expect(row!.entityId).toBe(PRODUCT_ID);
    expect(row!.oldValues).toEqual({ price: 10 });
    expect(row!.newValues).toEqual({ price: 20 });
    expect(row!.metadata).toEqual({
      ipAddress: '127.0.0.1',
      userAgent: 'jest-integration',
      requestId: 'req-int-1',
      reason: 'price correction',
    });
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it('stores rows in lowercase snake_case columns with explicit index names', async () => {
    interface AuditRawRow {
      tenant_id: string;
      entity_type: string;
    }

    const raw = await auditRepo.query<AuditRawRow[]>(
      'SELECT tenant_id, actor_id, entity_type, entity_id, old_values, new_values, metadata, created_at FROM audit_logs LIMIT 1',
    );
    expect(raw).toHaveLength(1);
    expect(raw[0].tenant_id).toBe(TENANT_ID);
    expect(raw[0].entity_type).toBe(AuditedEntityType.PRODUCT);

    const indexes = await auditRepo.query<Array<{ indexname: string }>>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_logs' AND indexname LIKE 'idx_audit_logs%'",
    );
    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('idx_audit_logs_tenant_created_at');
    expect(indexNames).toContain('idx_audit_logs_entity');
    expect(indexNames).toContain('idx_audit_logs_actor_id');
  });

  it('allows system-generated audit rows without an actor', async () => {
    const systemEntityId = 'd1111111-1111-4111-8111-111111111111';

    auditAsyncStorage.run(
      {
        tenantId: TENANT_ID,
        actorId: null,
        requestId: null,
        ipAddress: null,
        userAgent: null,
      },
      () =>
        auditService.record({
          action: AuditAction.CREATE,
          entityType: AuditedEntityType.CATEGORY,
          entityId: systemEntityId,
        }),
    );

    const row = await waitForAuditRow(auditRepo, systemEntityId);
    expect(row).not.toBeNull();
    expect(row!.actorId).toBeNull();
    expect(row!.action).toBe(AuditAction.CREATE);
  });

  it('isolates audit reads per tenant (doc Next Steps #2)', async () => {
    auditAsyncStorage.run(
      {
        tenantId: TENANT_B_ID,
        actorId: ACTOR_B_ID,
        requestId: 'req-int-b',
        ipAddress: '127.0.0.2',
        userAgent: 'jest-integration-b',
      },
      () =>
        auditService.record({
          action: AuditAction.CREATE,
          entityType: AuditedEntityType.PRODUCT,
          entityId: PRODUCT_B_ID,
          newValues: { name: 'Tenant B product' },
        }),
    );

    const rowB = await waitForAuditRow(auditRepo, PRODUCT_B_ID);
    expect(rowB).not.toBeNull();

    // Tenant A sees only its own rows
    const logsA = await auditService.findLogs(TENANT_ID, {});
    expect(logsA.data.length).toBeGreaterThan(0);
    expect(logsA.data.every((r) => r.tenantId === TENANT_ID)).toBe(true);
    expect(logsA.data.some((r) => r.entityId === PRODUCT_B_ID)).toBe(false);

    // Actor summaries are exposed, but sensitive user columns are never selected.
    // Note: `in` checks are meaningless here — with target ES2023 all declared
    // class fields exist as own properties (value undefined) on hydrated entities.
    const productRowA = logsA.data.find(
      (r) =>
        r.entityType === AuditedEntityType.PRODUCT && r.entityId === PRODUCT_ID,
    );
    expect(productRowA).toBeDefined();
    expect(productRowA!.actor).toMatchObject({
      id: ACTOR_ID,
      email: 'actor@audit-test.local',
    });
    expect(productRowA!.actor.passwordHash).toBeUndefined();

    // Tenant B sees only its own rows
    const logsB = await auditService.findLogs(TENANT_B_ID, {});
    expect(logsB.data.length).toBeGreaterThan(0);
    expect(logsB.data.every((r) => r.tenantId === TENANT_B_ID)).toBe(true);
    expect(logsB.data.some((r) => r.entityId === PRODUCT_ID)).toBe(false);

    // Entity-scoped reads are tenant-scoped too
    const entityBFromA = await auditService.findEntityLogs(
      TENANT_ID,
      PRODUCT_B_ID,
      {},
    );
    expect(entityBFromA.data).toHaveLength(0);

    const entityAFromA = await auditService.findEntityLogs(
      TENANT_ID,
      PRODUCT_ID,
      {},
    );
    expect(entityAFromA.data.length).toBeGreaterThan(0);

    const entityBFromB = await auditService.findEntityLogs(
      TENANT_B_ID,
      PRODUCT_B_ID,
      {},
    );
    expect(entityBFromB.data.length).toBeGreaterThan(0);
    expect(entityBFromB.data.every((r) => r.tenantId === TENANT_B_ID)).toBe(
      true,
    );
  });
});
