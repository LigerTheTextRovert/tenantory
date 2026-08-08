# M7 — Auth & RBAC Module: Security Engine

## Overview

This milestone builds the **Authentication & Role-Based Access Control (RBAC) Security Engine** for our multi-tenant e-commerce platform. Where M3 through M6 established tenant-isolated domain resources (Categories, Catalog, Inventory, Warehouses, Suppliers), M7 introduces identity management, secure authentication, password hashing, and granular role enforcement.

Because this is a multi-tenant platform, standard single-tenant authentication is insufficient. You will implement:
- **Tenant-Scoped User Identity**: Users belong to a specific tenant (via `tenant_id`), ensuring distinct login credentials and user isolation per tenant organization (with global `SUPER_ADMIN` capabilities).
- **Multi-Tenant JWT Claims**: JWT payloads encode user identity (`sub`), tenant identifier (`tenantId`), email, and assigned role (`role`) to drive instant authorization decisions across down-stream guards.
- **Hierarchical Role-Based Access Control (RBAC)**: Fine-grained permissions enforced declaratively via `@Roles(...)` decorators and custom NestJS execution guards.

---

## What You Will Build

```
Request → TenantMiddleware → TenantGuard → TenantInterceptor
    │
    └─► JwtAuthGuard (Validates Bearer Token & extracts JWT Payload)
             │
             └─► RolesGuard (Matches req.user.role against @Roles metadata)
                      │
                      └─► AuthController → AuthService → UserRepository
```

You will build the following endpoints under `/api/v1/auth`:

| Method | Endpoint              | Access Level     | Description                                           |
| :----- | :-------------------- | :--------------- | :---------------------------------------------------- |
| `POST` | `/api/v1/auth/register` | Public / Open    | Registers a new tenant user account                   |
| `POST` | `/api/v1/auth/login`    | Public / Open    | Authenticates credentials & returns Access JWT        |
| `POST` | `/api/v1/auth/refresh`  | Public / Signed  | Issues a new access token using a valid refresh token |
| `GET`  | `/api/v1/auth/me`       | Authenticated    | Retrieves profile and roles of current user           |

---

## Prerequisites

Before starting, ensure you have:
- Completed M6 (Inventory Module & Stock Management).
- Installed the core security dependencies (`@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcryptjs`, and corresponding types).
- Verified that `TenantGuard` and `TenantInterceptor` correctly inject the active tenant context.

---

## File Structure You Will Create

```
src/
└── auth/
    ├── auth.module.ts                   # Module definition & Passport/JWT registration
    ├── auth.controller.ts               # HTTP routes for auth operations
    ├── auth.service.ts                  # Password hashing, token generation, credential check
    ├── entities/
    │   └── user.entity.ts               # User entity with tenant reference and role enum
    ├── enums/
    │   └── user-role.enum.ts            # RBAC role definitions
    ├── dto/
    │   ├── register.dto.ts              # Payload validation for user registration
    │   ├── login.dto.ts                 # Payload validation for authentication
    │   ├── refresh-token.dto.ts          # Payload validation for token renewal
    │   └── user-response.dto.ts         # Response shape for user profiles
    ├── guards/
    │   ├── jwt-auth.guard.ts            # Passport JWT guard wrapper
    │   └── roles.guard.ts               # Reflector-based RBAC enforcement guard
    ├── decorators/
    │   └── roles.decorator.ts           # Metadata decorator for declaring route roles
    ├── strategies/
    │   └── jwt.strategy.ts              # Passport JWT extraction and validation strategy
    └── interfaces/
        └── jwt-payload.interface.ts     # TypeScript interface for JWT token payload
```

---

## Step 1: Define User Role Hierarchy

Create the role enumeration in `src/auth/enums/user-role.enum.ts` containing the following system roles:

- `SUPER_ADMIN`: System-wide platform manager (bypasses tenant restriction constraints).
- `TENANT_ADMIN`: Full administrative control within a single tenant organization.
- `CATALOG_MANAGER`: Read/write access restricted to categories, products, and variants.
- `WAREHOUSE_MANAGER`: Read/write access restricted to warehouses and inventory operations.
- `CUSTOMER`: Read-only access to published catalog items and personal order management.

---

## Step 2: Database Schema & User Entity Requirements

Define the `User` entity at `src/auth/entities/user.entity.ts` targeting the `users` table with these structural constraints:

1. **Primary Identifier**: UUID primary key generated via database default.
2. **Tenant Association**: Foreign key column `tenant_id` referencing `tenants.id` with `CASCADE` deletion. Must include an index named `idx_users_tenant_id`.
3. **Composite Unique Index**: Enforce uniqueness across the combination of `tenant` and `email` to allow identical emails across separate tenants while ensuring uniqueness within a tenant.
4. **Credential Storage**: Store hashed passwords in `password_hash` as a string column bounded to 255 characters. Never store plaintext credentials.
5. **Role Attribute**: Store assigned `UserRole` as a PostgreSQL `enum` type defaulting to `CUSTOMER`.
6. **Account State**: Boolean flag `is_active` defaulting to `true`.
7. **Audit Timestamps**: standard `created_at`, `updated_at`, and soft-delete `deleted_at` columns.

---

## Step 3: Specify Data Transfer Objects (DTOs)

Ensure incoming request payloads are strictly validated using `class-validator` rules:

### A. RegisterDto (`src/auth/dto/register.dto.ts`)
- `email`: Required valid email string (`@IsEmail()`), maximum 255 characters.
- `password`: Required string, minimum 8 characters, maximum 100 characters.
- `firstName`: Required non-empty string, maximum 100 characters.
- `lastName`: Required non-empty string, maximum 100 characters.
- `role`: Optional enum value matching `UserRole`.

### B. LoginDto (`src/auth/dto/login.dto.ts`)
- `email`: Required valid email string.
- `password`: Required string.

### C. RefreshTokenDto (`src/auth/dto/refresh-token.dto.ts`)
- `refreshToken`: Required JWT string.

---

## Step 4: JWT Strategy & Token Lifecycle Specification

### Token Configuration
- **Access Token**: Short-lived (15 minutes expiry) signed using a secure secret configured via `ConfigService`.
- **Refresh Token**: Long-lived (7 days expiry) signed with a separate secret.

### Payload Schema
The JWT payload must contain:
- `sub`: User ID (UUID).
- `tenantId`: Tenant ID (UUID).
- `email`: User email string.
- `role`: User role enum string.

### Passport Strategy (`src/auth/strategies/jwt.strategy.ts`)
- Extract token from the incoming HTTP `Authorization` header using `BearerTokenExtractor`.
- Verify signature and expiry using secret key from environment configuration.
- Validate that the referenced tenant match the active request context.
- Attach normalized payload object to `req.user`.

---

## 5. Security Guards & RBAC Execution Pipeline

### A. `@Roles(...)` Decorator (`src/common/decorators/roles.decorator.ts`)
- Attaches metadata key `roles` containing an array of permitted `UserRole` values to route handlers.

### B. `RolesGuard` (`src/auth/guards/roles.guard.ts`)
- Reads required role metadata using NestJS `Reflector`.
- If no role metadata is present on handler or controller class, grant access by default.
- If user role matches `SUPER_ADMIN`, grant global access immediately.
- Otherwise, verify `req.user.role` is included within the allowed roles list. If not, throw `ForbiddenException`.

---

## 6. Service Layer Business Logic Specification

Implement `AuthService` in `src/auth/auth.service.ts` with the following methods:

### 1. `register(tenantId: string, dto: RegisterDto)`
- Query `User` repository for existing email under the given `tenantId`.
- If user exists, throw `ConflictException` ('Email already registered for this tenant').
- Hash `dto.password` using `bcrypt.hash` with a minimum salt round factor of 10.
- Persist new user entity and return safe user profile response (excluding `passwordHash`).

### 2. `login(tenantId: string, dto: LoginDto)`
- Query `User` repository by `tenantId` and `dto.email`.
- If user is missing or `isActive` is false, throw `UnauthorizedException` ('Invalid credentials').
- Compare `dto.password` against `user.passwordHash` using `bcrypt.compare`.
- If password check fails, throw `UnauthorizedException` ('Invalid credentials').
- Sign and issue Access JWT and Refresh JWT tokens.

### 3. `validateJwtPayload(payload: JwtPayload)`
- Verify `user.id` exists and account remains active.
- Return user context object attached to request.

---

## 7. Controller & Documentation Specifications

Implement `AuthController` in `src/auth/auth.controller.ts`:
- Annotate public authentication routes (`register`, `login`, `refresh`) with `@Public()` to bypass mandatory header guard restrictions where applicable.
- Add OpenAPI (`@nestjs/swagger`) annotations (`@ApiTags('Auth')`, `@ApiOperation`, `@ApiResponse`).
- Set appropriate HTTP response status codes (`200 OK` for login/refresh, `201 Created` for registration).

---

## 8. Verification & Self-Check Loop

After implementing M7, run the compilation, linting, and testing pipelines:

1. **Compilation**: Execute `pnpm build` to confirm zero TypeScript compilation errors.
2. **Linting**: Execute `pnpm lint` to ensure strict type compliance and zero unused imports.
3. **Automated Unit Testing**: Execute `pnpm test` to verify all domain unit test suites pass cleanly.
