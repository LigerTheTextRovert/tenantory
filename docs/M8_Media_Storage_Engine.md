# M8 — Media Storage Engine (MinIO/S3 Integration)

## Overview

This milestone builds the **Media Storage Engine** for our multi-tenant e-commerce platform. Where M3 through M7 established isolated data domains and secure authentication, M8 tackles the handling of binary assets (e.g., product images, tenant logos, CSV imports) without bloat in our PostgreSQL database.

Because this is a multi-tenant platform with performance guarantees, binary blobs belong in Object Storage (S3-compatible). You will integrate **MinIO**, which runs locally for development and mimics AWS S3, allowing a seamless transition to the cloud for production.

You will implement:
- **Tenant-Scoped Object Isolation**: All objects uploaded must be strictly isolated by `tenant_id`. This is achieved by namespacing the S3 object keys (e.g., `<tenant_id>/images/product_123.jpg`).
- **Media Tracking**: A PostgreSQL `media_assets` table to track metadata (file size, mime type, original name) and link it securely to a tenant and entity (like a product).
- **Direct & Presigned Uploads**: A scalable upload mechanism utilizing S3 Presigned URLs to allow direct-to-storage uploads from the client, bypassing the Node.js monolith to preserve CPU and memory bandwidth.

---

## What You Will Build

```text
Client → Request Presigned URL (Auth via TenantGuard & JwtAuthGuard)
         │
         └─► Monolith (Generates short-lived AWS S3 Presigned PUT URL)
         
Client → Upload File Directly → MinIO/S3 Storage
```

You will build the following endpoints under `/api/v1/media`:

| Method | Endpoint                    | Access Level             | Description                                           |
| :----- | :-------------------------- | :----------------------- | :---------------------------------------------------- |
| `POST` | `/api/v1/media/upload`        | Authenticated (RBAC)     | Direct file upload (via Multer) for small files       |
| `GET`  | `/api/v1/media/presigned-put` | Authenticated (RBAC)     | Returns an S3 Presigned URL for large direct uploads  |
| `GET`  | `/api/v1/media/:id`           | Public / Tenant-Bound    | Retrieve media metadata or a signed download URL      |

---

## Prerequisites

Before starting, ensure you have:
- Completed M7 (Auth & RBAC Security Engine).
- Added MinIO to your `docker-compose.yml` (port 9000 for API, 9001 for Console).
- Installed the S3/MinIO dependencies: `npm i minio` or `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
- Installed Multer for standard uploads: `npm i -D @types/multer`.

---

## File Structure You Will Create

```text
src/
└── media/
    ├── media.module.ts                  # Module definition & S3 client provider
    ├── media.controller.ts              # HTTP routes for media operations
    ├── media.service.ts                 # S3 interactions (upload, presign, delete)
    ├── entities/
    │   └── media-asset.entity.ts        # Database tracking entity for uploaded files
    ├── dto/
    │   ├── upload-media.dto.ts          # Metadata payload accompanying an upload
    │   └── media-response.dto.ts        # API response formatting
    └── providers/
        └── s3-client.provider.ts        # Configures the MinIO/AWS S3 SDK client
```

---

## Step 1: MinIO Configuration & SDK Provider

1. In your `.env`, define your storage configuration:
   ```env
   S3_ENDPOINT=localhost
   S3_PORT=9000
   S3_USE_SSL=false
   S3_ACCESS_KEY=minioadmin
   S3_SECRET_KEY=minioadmin
   S3_BUCKET_NAME=tenantory-media
   ```
2. Create `src/media/providers/s3-client.provider.ts` using the official AWS SDK v3 `S3Client` or `minio` SDK. Inject the `ConfigService` to populate the credentials.

---

## Step 2: Database Tracking & Entity

Binary data goes to S3, but metadata must stay in Postgres to enforce relational integrity and multi-tenant filtering.
Create `src/media/entities/media-asset.entity.ts`:

- **Primary Identifier**: UUID.
- **Tenant Association**: `tenant_id` referencing `tenants.id`.
- **S3 Object Key**: String representing the exact path in the bucket (e.g., `eb83-.../products/img_1.png`).
- **Metadata**: `file_name`, `mime_type`, `size_bytes`.
- **Entity Association**: (Optional/Polymorphic) `entity_type` (e.g., 'PRODUCT', 'TENANT_LOGO') and `entity_id`.

---

## Step 3: Tenant-Isolated Storage Strategy

In `media.service.ts`, ensure that every S3 Object Key is explicitly prefixed with the active `tenantId`.

```typescript
const objectKey = `${tenantId}/${folderName}/${uuid}-${originalName}`;
```
**Never** allow user input to dictate the S3 key structure without prepending the `tenantId`. This is a critical security boundary to prevent cross-tenant object overwriting.

---

## Step 4: Implement Presigned URLs for High Performance

Standard Multer uploads buffer files in the NestJS server memory. For high throughput, implement a Presigned URL flow:

1. Client requests a URL: `GET /presigned-put?filename=image.jpg&mimetype=image/jpeg`
2. `MediaService` validates the request, generates a secure `objectKey` (prefixed with `tenantId`), and asks S3 for a Presigned PUT URL.
3. The monolith records the intended `MediaAsset` in the database with status `PENDING`.
4. Client uploads the binary directly to MinIO/S3 using the returned URL.

---

## Step 5: Security & RBAC Enforcement

Apply your newly created Security Engine (M7) to the `MediaController`:

- Use `TenantMiddleware` / `TenantGuard` to enforce the tenant context.
- Use `JwtAuthGuard` to ensure the user is logged in.
- Use `@Roles(UserRole.CATALOG_MANAGER, UserRole.TENANT_ADMIN)` to restrict who can upload media.

---

## Next Steps

After completing this module:
1. Verify uploading an image as `Tenant A` and confirming it is placed in `<tenant_a_id>/...` in the MinIO console.
2. Link the uploaded `MediaAsset` IDs to your `Product` and `Variant` entities created in M5.
