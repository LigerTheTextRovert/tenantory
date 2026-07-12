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
Request → TenantMiddleware → TenantGuard → TenantInterceptor → Controller → Service → QueryBuilder
                │                  │               │                           │
         Extract tenant_id    Verify tenant    Wrap in AsyncLocalStorage  Inject tenant_id
         from header,         is active        so downstream code can     into ALL queries
         validate UUID,       (defense in      access tenant without      automatically
         lookup in DB         depth)           parameter passing
```

Three components:

1. **TenantMiddleware** — Extracts tenant from header, validates, and looks up in DB
2. **TenantGuard** — Verifies tenant status is ACTIVE (defense in depth)
3. **TenantInterceptor** — Wraps request in AsyncLocalStorage for downstream access

---

## Prerequisites

Before starting, ensure you have:

- NestJS app scaffolded and running (`pnpm run start:dev`)
- TypeORM connected to PostgreSQL
- Tenant entity created and registered (already done)
- Global ValidationPipe and HttpExceptionFilter wired (M1 — do this first)
- Basic understanding of NestJS Middleware, Interceptors, Guards, and Decorators

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
│   ├── tenant.middleware.ts              # New — extract tenant from request header
│   ├── tenant.interceptor.ts             # New — AsyncLocalStorage for tenant scope
│   ├── tenant.guard.ts                   # New — enforce ACTIVE status
│   └── tenant-context.ts                 # AsyncLocalStorage for tenant scope
└── main.ts                               # Register middleware + guard + interceptor globally
```

---

## Step 1: Tenant Context (AsyncLocalStorage)

### Why AsyncLocalStorage?

NestJS middleware and guards run on the request pipeline, but downstream
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

The middleware needs to verify that the tenant actually exists and is active.
You don't want to hit the database directly from middleware — that violates
the separation of concerns. The service handles the DB lookup, and the
middleware calls the service.

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

  async findByIdAndValidate(id: string): Promise<Tenant | null> {
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

The `exports: [TenantService]` is mandatory. Without it, the middleware and
guard cannot inject TenantService.

---

## Step 3: Tenant Middleware

### What It Does

1. Reads the `X-Tenant-ID` header from the incoming request
2. Validates it is a valid UUID
3. Looks up the tenant in the database via TenantService
4. Binds the tenant to the request context (`req.tenant` and `req.tenantId`)
5. Calls `next()` to pass control to the next middleware/guard
6. Returns 400 if header is missing or invalid
7. Returns 404 if tenant does not exist or is archived

### Why Middleware First?

In NestJS, the request lifecycle is: **Middleware → Guards → Interceptors → Controller**.

Middleware runs before everything else, making it the right place to:
- Extract and validate the tenant identity from the header
- Look up the tenant in the database
- Set the tenant on the request object

The guard then runs (after middleware) and can check the tenant status.
The interceptor runs last and wraps the request in AsyncLocalStorage.

If we tried to do tenant extraction in the interceptor, the guard would
run first and find no tenant context — breaking the entire flow.

### Create `src/tenant/tenant.middleware.ts`

```typescript
import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.headers['x-tenant-id'];

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

    // --- Step 3: Verify tenant exists and is not archived ---
    const tenant = await this.tenantService.findByIdAndValidate(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found or is archived');
    }

    // --- Step 4: Bind to request context ---
    req['tenant'] = tenant;
    req['tenantId'] = tenant.id;

    next();
  }
}
```

### Key Decisions Explained

**Why middleware and not interceptor for extraction?**
NestJS execution order is Middleware → Guards → Interceptors. The guard
needs `request.tenant` to be set before it runs. Middleware runs first,
so it can set the tenant before the guard checks it.

**Why check ARCHIVED status here but not SUSPENDED?**
ARCHIVED tenants should return 404 (they don't exist anymore from the
system's perspective). SUSPENDED tenants still exist but shouldn't be
accessed — that's a 403 (Forbidden) which the guard handles. This
distinction gives callers meaningful error codes.

**Why `req['tenant']` instead of `req.tenant`?**
Express's `Request` type doesn't have a `tenant` property by default.
We use bracket notation to avoid TypeScript errors. A proper approach
would be to extend the Express Request interface, but that's beyond M3
scope.

---

## Step 4: Tenant Guard

### What It Does

1. Runs AFTER middleware (Guards execute after Middleware in NestJS)
2. Checks the tenant is in ACTIVE status (middleware already validates existence,
   but defense in depth is critical for security)
3. Rejects non-ACTIVE tenants with 403 Forbidden

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

    // --- Enforce ACTIVE status (belt-and-suspenders with middleware) ---
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant is currently ${tenant.status}. Access denied.`,
      );
    }

    return true;
  }
}
```

### Why a Separate Guard if the Middleware Already Checks Status?

**Defense in depth.** Security-critical checks should never rely on a single
layer. If the middleware is accidentally disabled, reordered, or bypassed
(e.g., a WebSocket gateway), the guard is still there as a safety net.

---

## Step 5: Global Registration

### Update `src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // --- Global Middleware: extract tenant from every request ---
  // Note: NestJS doesn't have app.useGlobalMiddleware()
  // Middleware must be registered per-module or via configure()
  // See Step 5a for the recommended approach

  // --- Global Guard: enforce tenant status on every request ---
  app.useGlobalGuards(app.get(TenantGuard));

  // --- Global Interceptor: wrap in AsyncLocalStorage ---
  app.useGlobalInterceptors(app.get(TenantInterceptor));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

### Step 5a: Register Middleware Globally

NestJS doesn't support `app.useGlobalMiddleware()`. You have two options:

**Option A: Register in AppModule (Recommended)**

```typescript
// src/app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TenantModule } from './tenant/tenant.module';
import { TenantMiddleware } from './tenant/tenant.middleware';

@Module({
  imports: [TenantModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');  // Apply to all routes
  }
}
```

**Option B: Register in a shared CoreModule**

If you have a `CoreModule` that other modules import, register there.
This keeps `AppModule` clean.

### Why app.get() instead of new?

NestJS's DI container manages the lifecycle of all injectables. Using
`app.get(TenantGuard)` retrieves the already-instantiated guard
from the container, so its dependencies are properly resolved.
Creating with `new` bypasses DI entirely.

---

## Step 6: Tenant Interceptor (AsyncLocalStorage)

### What It Does

This interceptor has a single responsibility: wrap the request in
`AsyncLocalStorage` so downstream code (services, repositories) can
access the tenant without explicit parameter passing.

It runs AFTER the middleware (which extracts and validates the tenant)
and AFTER the guard (which checks status). By the time the interceptor
runs, `request.tenantId` is already set.

### Create `src/tenant/tenant.interceptor.ts`

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request['tenantId'];

    if (!tenantId) {
      return next.handle();
    }

    return tenantAsyncStorage.run({ tenantId }, () => next.handle());
  }
}
```

### Why a Separate Interceptor for Just AsyncLocalStorage?

**Single Responsibility.** The middleware handles extraction and validation.
The guard handles status checking. The interceptor handles context propagation.

This separation makes each component:
- Easier to test in isolation
- Easier to reason about
- Less likely to have bugs (each does one thing)

---

## Step 7: Custom Decorator for Controller Access

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

## Step 8: Testing

### Unit Test — TenantMiddleware

Create `src/tenant/tenant.middleware.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';
import { Request, Response, NextFunction } from 'express';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let tenantService: TenantService;

  const mockTenantService = {
    findByIdAndValidate: jest.fn(),
  };

  beforeEach(() => {
    tenantService = mockTenantService as any;
    middleware = new TenantMiddleware(tenantService);
  });

  const createMockRequest = (headers: Record<string, string>) => {
    return { headers, tenant: null, tenantId: null } as unknown as Request;
  };

  const mockResponse = {} as Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = jest.fn();
  });

  it('should throw BadRequestException when X-Tenant-ID is missing', async () => {
    const request = createMockRequest({});

    await expect(
      middleware.use(request, mockResponse, mockNext),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when tenant ID is not a valid UUID', async () => {
    const request = createMockRequest({ 'x-tenant-id': 'not-a-uuid' });

    await expect(
      middleware.use(request, mockResponse, mockNext),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when tenant is not found', async () => {
    mockTenantService.findByIdAndValidate.mockResolvedValue(null);
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const request = createMockRequest({ 'x-tenant-id': tenantId });

    await expect(
      middleware.use(request, mockResponse, mockNext),
    ).rejects.toThrow(NotFoundException);
  });

  it('should set tenant on request and call next()', async () => {
    const mockTenant = { id: 'uuid-123', status: 'active' };
    mockTenantService.findByIdAndValidate.mockResolvedValue(mockTenant);
    const request = createMockRequest({ 'x-tenant-id': 'uuid-123' });

    await middleware.use(request, mockResponse, mockNext);

    expect(request['tenant']).toEqual(mockTenant);
    expect(request['tenantId']).toBe('uuid-123');
    expect(mockNext).toHaveBeenCalled();
  });
});
```

### Unit Test — TenantInterceptor

Create `src/tenant/tenant.interceptor.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';
import { tenantAsyncStorage } from './tenant-context';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;

  beforeEach(() => {
    interceptor = new TenantInterceptor();
  });

  const createMockContext = (tenantId: string | null) => {
    const request = { tenantId };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  const mockNext = {
    handle: () => ({ subscribe: jest.fn() }),
  };

  it('should wrap request in AsyncLocalStorage when tenantId exists', () => {
    const context = createMockContext('uuid-123');
    const spy = jest.spyOn(tenantAsyncStorage, 'run');

    interceptor.intercept(context, mockNext as any);

    expect(spy).toHaveBeenCalledWith(
      { tenantId: 'uuid-123' },
      expect.any(Function),
    );
  });

  it('should call next.handle() directly when no tenantId', () => {
    const context = createMockContext(null);
    const spy = jest.spyOn(tenantAsyncStorage, 'run');

    interceptor.intercept(context, mockNext as any);

    expect(spy).not.toHaveBeenCalled();
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
3. Middleware runs (TenantMiddleware)
   ├── Extracts X-Tenant-ID header
   ├── Validates UUID format
   ├── Looks up tenant in DB
   ├── Sets request.tenant + request.tenantId
   └── Calls next() to proceed
4. Global Guards run (TenantGuard)
   └── Verifies tenant.status === ACTIVE
5. Route-specific Guards run (e.g., AuthGuard, RoleGuard)
6. Global Interceptors run (TenantInterceptor)
   └── Wraps downstream in AsyncLocalStorage context
7. Controller method executes
8. Service layer executes
9. Repository / QueryBuilder executes (can read tenant from AsyncStore)
10. Response flows back through interceptors (after interceptor hook)
11. HTTP Response sent to client
```

**Key insight:** NestJS execution order is Middleware → Guards → Interceptors → Controller.

If you put tenant extraction in an interceptor, the guard would run first
and find no tenant context — breaking the entire flow. That's why
extraction belongs in middleware.

---

## Common Pitfalls

### 1. Middleware Not Registered

**Problem:** Middleware not applied to routes because it wasn't registered.

**Fix:** NestJS doesn't have `app.useGlobalMiddleware()`. You must register
middleware via `configure()` in a module:

```typescript
// CORRECT — in AppModule or a shared module
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(TenantMiddleware)
    .forRoutes('*');
}

// WRONG — this doesn't exist
app.useGlobalMiddleware(app.get(TenantMiddleware));
```

### 2. TenantService Not Exported

**Problem:** TenantModule has TenantService as a provider but forgot to export it.

**Fix:** Add `exports: [TenantService]` to TenantModule. Without this, no
other module can inject TenantService.

### 3. AsyncLocalStorage Not Wrapping the Handler

**Problem:** Not calling `tenantAsyncStorage.run()` before `next.handle()`.

**Fix:** The interceptor must wrap `next.handle()` inside `run()`:

```typescript
// CORRECT
return tenantAsyncStorage.run({ tenantId }, () => next.handle());

// WRONG — context not set
next.handle();
```

### 4. Putting Tenant Extraction in Interceptor Instead of Middleware

**Problem:** Confusion about execution order leads to extracting tenant
in an interceptor, which runs AFTER the guard.

**Fact:** NestJS execution order is Middleware → Guards → Interceptors.
The guard needs `request.tenant` before it runs. If you put extraction
in the interceptor, the guard will find no tenant and throw 403.

### 5. Forgetting to Handle Suspended Tenants

**Problem:** Only checking for tenant existence, not status.

**Fix:** Check both existence AND status. A suspended tenant must get 403,
not 404. A missing tenant gets 404.

### 6. Not Sanitizing the Header

**Problem:** Accepting any string as tenant ID without UUID validation.

**Fix:** Always validate UUID format BEFORE hitting the database. This
prevents unnecessary DB queries with malformed input and guards against
SQL injection at the application layer.

### 7. Using `req.tenant` Instead of `req['tenant']`

**Problem:** TypeScript error because Express's Request type doesn't have
a `tenant` property.

**Fix:** Use bracket notation: `req['tenant'] = tenant`. For type safety,
extend the Express Request interface (optional, beyond M3 scope).

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
- [ ] Unit tests pass for middleware, guard, and interceptor
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
