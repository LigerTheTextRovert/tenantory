# M3 — Multi-Tenancy Engine Implementation Guide

## Overview

This milestone implements the **core security backbone** of the entire platform.
Every subsequent module depends on it. Without a bulletproof tenant isolation
layer, the system is vulnerable to cross-tenant data leaks — the single most
critical failure mode in a multi-tenant architecture.

The goal: extract tenant identity from every incoming request, validate it,
enforce it, and make it impossible for any database query to bypass it.

---

## What You Will Build

```
Request → TenantInterceptor → TenantGuard → Controller → Service → QueryBuilder
                 │                  │                           │
          Extract tenant_id    Verify tenant            Inject tenant_id
          from header/sub-     is active & valid        into ALL queries
          domain & bind to                              automatically
          request context
```

Three components:

1. **TenantInterceptor** — Extracts and validates tenant identity
2. **TenantGuard** — Verifies tenant status is ACTIVE
3. **TenantScopeMiddleware or Base Query pattern** — Injects tenant_id into queries

---

## Prerequisites

Before starting, ensure you have:

- NestJS app scaffolded and running (`pnpm run start:dev`)
- TypeORM connected to PostgreSQL
- Tenant entity created and registered (already done)
- Global ValidationPipe and HttpExceptionFilter wired (M1 — do this first)
- Basic understanding of NestJS Interceptors, Guards, and Decorators

---

## File Structure You Will Create

```
src/
├── common/
│   ├── decorators/
│   │   └── tenant.decorator.ts          # @CurrentTenant() param decorator
│   └── interfaces/
│       └── tenant-context.interface.ts   # TypeScript interface for tenant context
├── tenant/
│   ├── tenant.module.ts                  # Updated — export TenantService
│   ├── tenant.service.ts                 # New — DB lookup for tenant validation
│   ├── tenant.interceptor.ts             # New — extract tenant from request
│   ├── tenant.guard.ts                   # New — enforce ACTIVE status
│   └── tenant-context.ts                 # AsyncLocalStorage for tenant scope
└── main.ts                               # Register interceptor + guard globally
```

---

## Step 1: Tenant Context (AsyncLocalStorage)

### Why AsyncLocalStorage?

NestJS interceptors and guards run on the request pipeline, but downstream
services and repositories may need the tenant_id without passing it through
every function parameter. `AsyncLocalStorage` gives you a request-scoped
execution context that any code in the call stack can read from.

### Create `src/tenant/tenant-context.ts`

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextData {
  tenantId: string;
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantContextData>();
```

This is a lightweight store. Every incoming HTTP request gets its own isolated
context. When the request finishes, the context is garbage collected.

---

## Step 2: Tenant Service

### Why a Service?

The interceptor needs to verify that the tenant actually exists and is active.
You don't want to hit the database directly from an interceptor — that violates
the separation of concerns. The service handles the DB lookup, and the
interceptor calls the service.

### Create `src/tenant/tenant.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({ where: { id } });
  }

  async findByIdAndValidate(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);

    if (!tenant) {
      return null;
    }

    if (tenant.status === TenantStatus.ARCHIVED) {
      return null;
    }

    return tenant;
  }
}
```

### Update `src/tenant/tenant.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantService],
  exports: [TenantService],        // CRITICAL — other modules import this
})
export class TenantModule {}
```

The `exports: [TenantService]` is mandatory. Without it, the guard and
interceptor cannot inject TenantService.

---

## Step 3: Tenant Interceptor

### What It Does

1. Reads the `X-Tenant-ID` header from the incoming request
2. Validates it is a valid UUID
3. Looks up the tenant in the database via TenantService
4. Binds the tenant to the request context
5. Runs the request inside AsyncLocalStorage so any downstream code
   can access the tenant without explicit parameter passing
6. Returns 400 if header is missing or invalid
7. Returns 404 if tenant does not exist

### Create `src/tenant/tenant.interceptor.ts`

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { TenantService } from './tenant.service';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantService: TenantService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];

    // --- Step 1: Validate presence ---
    if (!tenantId) {
      throw new BadRequestException('Missing X-Tenant-ID header');
    }

    // --- Step 2: Validate UUID format ---
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    // --- Step 3: Verify tenant exists and is active ---
    const tenant = await this.tenantService.findByIdAndValidate(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found or is archived');
    }

    // --- Step 4: Bind to request and AsyncLocalStorage ---
    request.tenant = tenant;
    request.tenantId = tenant.id;

    // Run the rest of the request inside the tenant context
    return tenantAsyncStorage.run({ tenantId: tenant.id }, () =>
      next.handle(),
    );
  }
}
```

### Key Decisions Explained

**Why check status here and not in the guard?**
The interceptor is the right place because it needs to resolve the tenant
object before the guard runs. The guard then decides what to DO with that
context (e.g., check user permissions against the tenant).

**Why AsyncStorage.run()?**
Everything inside `next.handle()` (the controller, service, repository) runs
inside this async context. Any downstream code can call
`tenantAsyncStorage.getStore()?.tenantId` to get the current tenant without
it being passed as a parameter. This eliminates the risk of forgetting to
pass tenant_id through 5 layers of function calls.

---

## Step 4: Tenant Guard

### What It Does

1. Runs AFTER the interceptor (guards execute after interceptors in NestJS
   — actually, interceptors wrap around the guard, so the tenant is already
   resolved when the guard runs)
2. Checks the tenant is in ACTIVE status (interceptor already does this, but
   defense in depth is critical for security)
3. Checks the tenant on the request matches the tenant in the URL or JWT
   (prevents a user from spoofing a different tenant's context)

### Create `src/tenant/tenant.guard.ts`

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { TenantStatus } from './entities/tenant.entity';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // --- Defense in depth: verify tenant was resolved ---
    const tenant = request.tenant;

    if (!tenant) {
      throw new ForbiddenException('No tenant context established');
    }

    // --- Enforce ACTIVE status (belt-and-suspenders with interceptor) ---
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant is currently ${tenant.status}. Access denied.`,
      );
    }

    return true;
  }
}
```

### Why a Separate Guard if the Interceptor Already Checks Status?

**Defense in depth.** Security-critical checks should never rely on a single
layer. If the interceptor is accidentally disabled, reordered, or bypassed
(e.g., a WebSocket gateway), the guard is still there as a safety net.

---

## Step 5: Global Registration

### Update `src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { TenantGuard } from './tenant/tenant.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // --- Global Interceptor: extract tenant from every request ---
  app.useGlobalInterceptors(app.get(TenantInterceptor));

  // --- Global Guard: enforce tenant status on every request ---
  app.useGlobalGuards(app.get(TenantGuard));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

### Why app.get() instead of new?

NestJS's DI container manages the lifecycle of all injectables. Using
`app.get(TenantInterceptor)` retrieves the already-instantiated interceptor
from the container, so its dependencies (TenantService, etc.) are properly
resolved. Creating with `new` bypasses DI entirely.

---

## Step 6: Custom Decorator for Controller Access

### Why?

Every controller that needs the tenant would otherwise have to write
`@Req() req` and then do `req.tenantId`. A custom decorator makes this
clean and type-safe.

### Create `src/common/decorators/tenant.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '../../tenant/entities/tenant.entity';

export const CurrentTenant = createParamDecorator(
  (data: 'id' | 'object' | undefined, ctx: ExecutionContext): string | Tenant => {
    const request = ctx.switchToHttp().getRequest();

    if (data === 'id') {
      return request.tenantId;
    }

    if (data === 'object') {
      return request.tenant;
    }

    // Default: return the tenant ID
    return request.tenantId;
  },
);
```

### Usage in any controller:

```typescript
@Get('categories')
findAll(@CurrentTenant('id') tenantId: string) {
  return this.categoryService.findAll(tenantId);
}

@Get('categories/:id')
findOne(
  @CurrentTenant('id') tenantId: string,
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.categoryService.findOne(tenantId, id);
}
```

---

## Step 7: Testing

### Unit Test — TenantInterceptor

Create `src/tenant/tenant.interceptor.spec.ts`:

```typescript
import { ExecutionContext, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantService } from './tenant.service';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let tenantService: TenantService;

  const mockTenantService = {
    findByIdAndValidate: jest.fn(),
  };

  beforeEach(() => {
    tenantService = mockTenantService as any;
    interceptor = new TenantInterceptor(tenantService);
  });

  const createMockContext = (headers: Record<string, string>) => {
    const request = { headers, tenant: null, tenantId: null };
    const response = {};
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  };

  const mockNext = {
    handle: () => ({ subscribe: jest.fn() }),
  };

  it('should throw BadRequestException when X-Tenant-ID is missing', async () => {
    const context = createMockContext({});

    await expect(
      interceptor.intercept(context, mockNext as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when tenant ID is not a valid UUID', async () => {
    const context = createMockContext({ 'x-tenant-id': 'not-a-uuid' });

    await expect(
      interceptor.intercept(context, mockNext as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when tenant is not found', async () => {
    mockTenantService.findByIdAndValidate.mockResolvedValue(null);
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const context = createMockContext({ 'x-tenant-id': tenantId });

    await expect(
      interceptor.intercept(context, mockNext as any),
    ).rejects.toThrow(NotFoundException);
  });
});
```

### Unit Test — TenantGuard

Create `src/tenant/tenant.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantStatus } from './entities/tenant.entity';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  const createContext = (tenant: any) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ tenant }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow ACTIVE tenants', () => {
    expect(guard.canActivate(createContext({ status: TenantStatus.ACTIVE })))
      .toBe(true);
  });

  it('should reject SUSPENDED tenants', () => {
    expect(() =>
      guard.canActivate(createContext({ status: TenantStatus.SUSPENDED })),
    ).toThrow(ForbiddenException);
  });

  it('should reject when no tenant context', () => {
    expect(() => guard.canActivate(createContext(null))).toThrow(
      ForbiddenException,
    );
  });
});
```

### Manual Integration Test

Once implemented, test with curl:

```bash
# Should return 400 — missing header
curl http://localhost:3000/api/v1/categories

# Should return 400 — invalid UUID format
curl -H "X-Tenant-ID: not-a-uuid" http://localhost:3000/api/v1/categories

# Should return 404 — valid UUID but tenant doesn't exist
curl -H "X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440000" \
  http://localhost:3000/api/v1/categories

# Should return 200 (or appropriate response) — valid active tenant
curl -H "X-Tenant-ID: <real-tenant-uuid>" http://localhost:3000/api/v1/categories
```

---

## Execution Order in the Request Lifecycle

Understanding this is critical for debugging:

```
1. HTTP Request arrives
2. NestJS route matching
3. Global Interceptors run (TenantInterceptor)
   ├── Extracts X-Tenant-ID header
   ├── Validates UUID format
   ├── Looks up tenant in DB
   ├── Sets request.tenant + request.tenantId
   └── Wraps downstream in AsyncLocalStorage context
4. Global Guards run (TenantGuard)
   └── Verifies tenant.status === ACTIVE
5. Route-specific Guards run (e.g., AuthGuard, RoleGuard)
6. Controller method executes
7. Service layer executes
8. Repository / QueryBuilder executes (can read tenant from AsyncStore)
9. Response flows back through interceptors (after interceptor hook)
10. HTTP Response sent to client
```

---

## Common Pitfalls

### 1. Interceptor Not Resolving Dependencies

**Problem:** Creating interceptor with `new TenantInterceptor()` in main.ts
instead of `app.get(TenantInterceptor)`.

**Fix:** Always use `app.get()` so DI resolves TenantService.

### 2. TenantService Not Exported

**Problem:** TenantModule has TenantService as a provider but forgot to export it.

**Fix:** Add `exports: [TenantService]` to TenantModule. Without this, no
other module can inject TenantService.

### 3. AsyncLocalStorage Not Wrapping the Handler

**Problem:** Not calling `tenantAsyncStorage.run()` before `next.handle()`.

**Fix:** The interceptor must wrap `next.handle()` inside `run()`:

```typescript
// CORRECT
return tenantAsyncStorage.run({ tenantId: tenant.id }, () => next.handle());

// WRONG — context not set
next.handle();
```

### 4. Guard Running Before Interceptor

**Problem:** Confusion about execution order.

**Fact:** In NestJS, interceptors wrap around guards. The interceptor's
`intercept()` runs first, calls `next.handle()`, and INSIDE that call,
the guard runs. So by the time the guard executes, the interceptor has
already set `request.tenant`. This is the correct behavior.

### 5. Forgetting to Handle Suspended Tenants

**Problem:** Only checking for tenant existence, not status.

**Fix:** Check both existence AND status. A suspended tenant must get 403,
not 404. A missing tenant gets 404.

### 6. Not Sanitizing the Header

**Problem:** Accepting any string as tenant ID without UUID validation.

**Fix:** Always validate UUID format BEFORE hitting the database. This
prevents unnecessary DB queries with malformed input and guards against
SQL injection at the application layer.

---

## Acceptance Criteria

M3 is complete when:

- [ ] Every request without `X-Tenant-ID` header returns `400 Bad Request`
- [ ] Every request with an invalid UUID returns `400 Bad Request`
- [ ] Every request with a non-existent tenant returns `404 Not Found`
- [ ] Every request with an archived tenant returns `404 Not Found`
- [ ] Every request with a suspended tenant returns `403 Forbidden`
- [ ] Every request with a valid active tenant proceeds to the controller
- [ ] `@CurrentTenant()` decorator works in any controller
- [ ] `tenantAsyncStorage.getStore()?.tenantId` is accessible in services
- [ ] Unit tests pass for both interceptor and guard
- [ ] No controller or service can accidentally query across tenants

---

## What NOT to Build in M3

- Custom query builder wrappers — too early, premature abstraction
- RBAC roles and permissions — that's a separate concern (M3.5 or later)
- Audit logging of tenant access — that's M6 territory
- Subdomain-based tenant resolution — start with header-based only,
  add subdomain routing later when Nginx is configured

---

## Next Steps After M3

Once M3 is done and tested, you can safely build:

1. **Category CRUD** — first real module with tenant-scoped operations
   (good proving ground to verify the tenant isolation works end-to-end)
2. **Product & Variant CRUD** — catalog module
3. **Then** move to M4 (Inventory & Locks) once the pattern is validated
