import { createHash } from 'crypto';

export const CACHE_TTL = {
  DEFAULT: 300,
  PRODUCT: 300,
  CATEGORY: 1800,
  USER: 300,
} as const;

const hashQuery = (query: unknown): string =>
  createHash('sha1')
    .update(JSON.stringify(query ?? {}))
    .digest('hex')
    .slice(0, 16);

export const CacheKeys = {
  category: (tenantId: string, id: string): string =>
    `t:${tenantId}:category:${id}`,

  categoriesList: (tenantId: string, query: unknown): string =>
    `t:${tenantId}:categories:list:${hashQuery(query)}`,

  categoriesTree: (tenantId: string): string => `t:${tenantId}:categories:tree`,

  categoriesPattern: (tenantId: string): string => `t:${tenantId}:categories:*`,

  product: (tenantId: string, id: string): string =>
    `t:${tenantId}:product:${id}`,

  productsList: (tenantId: string, query: unknown): string =>
    `t:${tenantId}:products:list:${hashQuery(query)}`,

  productsPattern: (tenantId: string): string => `t:${tenantId}:products:*`,

  user: (tenantId: string, id: string): string => `t:${tenantId}:user:${id}`,
};
