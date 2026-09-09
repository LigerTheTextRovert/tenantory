export const AuditedEntityType = {
  PRODUCT: 'product',
  PRODUCT_VARIANT: 'product_variant',
  CATEGORY: 'category',
  STOCK_LEVEL: 'stock_level',
  WAREHOUSE: 'warehouse',
  SUPPLIER: 'supplier',
  TENANT: 'tenant',
  TENANT_SETTING: 'tenant_setting',
  USER: 'user',
} as const;

export type AuditedEntityType =
  (typeof AuditedEntityType)[keyof typeof AuditedEntityType];
