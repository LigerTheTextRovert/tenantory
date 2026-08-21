# M9 — Admin Management Engine

## Overview

This milestone builds the **Admin Management Engine** for our multi-tenant e-commerce platform. While the Auth engine handles authentication and RBAC, the Admin engine is responsible for the provisioning, lifecycle management, and overarching configuration of Tenants and system-wide resources.

As a multi-tenant application, administrative actions are divided into two tiers:
1. **System Administration (Super Admin)**: Operations that span across all tenants. This includes creating new tenants, suspending tenants, and managing global system configuration.
2. **Tenant Administration (Tenant Admin)**: Operations scoped to a specific tenant. This includes managing tenant-specific settings, inviting users to the tenant, and assigning roles to users within that tenant.

You will implement:
- **Tenant Provisioning**: Endpoints for Super Admins to create and initialize new tenants.
- **Tenant Settings Management**: Endpoints for Tenant Admins to manage their tenant's configuration (e.g., store name, contact info, default currency) stored securely via JSONB or structured columns.
- **User Management within Tenant**: Endpoints for Tenant Admins to invite, suspend, or manage roles of users within their own tenant boundary.

---

## What You Will Build

You will build the following endpoints under `/api/v1/admin`:

| Method | Endpoint                              | Access Level           | Description                                                |
| :----- | :------------------------------------ | :--------------------- | :--------------------------------------------------------- |
| `POST` | `/api/v1/admin/tenants`                 | Super Admin            | Provision a new tenant and create initial admin user       |
| `PATCH`| `/api/v1/admin/tenants/:id/status`      | Super Admin            | Suspend or activate a tenant                               |
| `GET`  | `/api/v1/admin/settings`                | Tenant Admin           | Retrieve current tenant settings                           |
| `PATCH`| `/api/v1/admin/settings`                | Tenant Admin           | Update current tenant settings                             |
| `POST` | `/api/v1/admin/users/invite`            | Tenant Admin           | Invite a new user to the current tenant                    |
| `PATCH`| `/api/v1/admin/users/:userId/role`      | Tenant Admin           | Update a user's role within the current tenant             |

---

## File Structure You Will Create

```text
src/
└── admin/
    ├── admin.module.ts                  # Module definition
    ├── controllers/
    │   ├── system-admin.controller.ts   # HTTP routes for Super Admins
    │   └── tenant-admin.controller.ts   # HTTP routes for Tenant Admins
    ├── services/
    │   ├── tenant-provisioning.service.ts # Logic for setting up new tenants
    │   └── tenant-settings.service.ts   # Logic for tenant configuration
    ├── entities/
    │   └── tenant-setting.entity.ts     # Database entity for tenant config (optional if stored in main Tenant table)
    └── dto/
        ├── create-tenant.dto.ts
        ├── update-settings.dto.ts
        └── invite-user.dto.ts
```

---

## Step 1: System Admin & Tenant Provisioning

The `SystemAdminController` handles global operations. When provisioning a new tenant, the `TenantProvisioningService` must execute a multi-step database transaction:
1. Create the `Tenant` record.
2. Initialize default configurations for the new tenant.
3. Create the initial `User` for this tenant and assign them the `TENANT_ADMIN` role.

**Security Rule:** Ensure these endpoints are protected by a `SuperAdminGuard` or strict role check that bypasses the standard `tenant_id` filter since Super Admins operate globally.

---

## Step 2: Tenant Settings Management

The `TenantAdminController` handles scoped operations.
- Ensure all queries strictly enforce the `tenant_id` using the `TenantGuard` and Interceptors.
- Use PostgreSQL `JSONB` for extensible configuration (e.g., `{ "currency": "USD", "theme": "dark", "features": ["advanced_inventory"] }`) if the settings schema is highly dynamic, or structured columns if the schema is fixed.

---

## Step 3: Scoped User Management

Tenant Admins should only be able to view and manage users associated with their `tenant_id`. 
- When updating a user's role or inviting a user, the backend must verify that the target user belongs to the same tenant as the requesting Tenant Admin.

---

## Next Steps

After completing this module:
1. Verify that a Tenant Admin cannot access the `/api/v1/admin/tenants` endpoints.
2. Verify that a Tenant Admin cannot modify users belonging to a different tenant.
3. Write end-to-end tests validating the tenant provisioning transaction.
