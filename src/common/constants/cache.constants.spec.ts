import { CacheKeys } from './cache.constants';

describe('CacheKeys', () => {
  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('should build tenant-scoped entity keys', () => {
    expect(CacheKeys.product(TENANT_ID, 'p1')).toBe(
      `t:${TENANT_ID}:product:p1`,
    );
    expect(CacheKeys.category(TENANT_ID, 'c1')).toBe(
      `t:${TENANT_ID}:category:c1`,
    );
    expect(CacheKeys.user(TENANT_ID, 'u1')).toBe(`t:${TENANT_ID}:user:u1`);
  });

  it('should build tenant-scoped list keys with a stable query hash', () => {
    const query = { page: 1, limit: 10, search: 'shirt' };

    const keyA = CacheKeys.productsList(TENANT_ID, query);
    const keyB = CacheKeys.productsList(TENANT_ID, { ...query });

    expect(keyA).toBe(keyB);
    expect(keyA).toMatch(
      new RegExp(`^t:${TENANT_ID}:products:list:[0-9a-f]{16}$`),
    );
  });

  it('should produce different list keys for different queries', () => {
    const keyA = CacheKeys.productsList(TENANT_ID, { page: 1 });
    const keyB = CacheKeys.productsList(TENANT_ID, { page: 2 });

    expect(keyA).not.toBe(keyB);
  });

  it('should produce different keys for different tenants', () => {
    const keyA = CacheKeys.category('tenant-a', 'c1');
    const keyB = CacheKeys.category('tenant-b', 'c1');

    expect(keyA).not.toBe(keyB);
  });

  it('should build collection invalidation patterns', () => {
    expect(CacheKeys.categoriesPattern(TENANT_ID)).toBe(
      `t:${TENANT_ID}:categories:*`,
    );
    expect(CacheKeys.productsPattern(TENANT_ID)).toBe(
      `t:${TENANT_ID}:products:*`,
    );
    expect(CacheKeys.categoriesTree(TENANT_ID)).toBe(
      `t:${TENANT_ID}:categories:tree`,
    );
  });
});
