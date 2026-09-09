import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { CACHE_TTL } from '../constants/cache.constants';

describe('CacheService', () => {
  let service: CacheService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    ttl: jest.Mock;
    scan: jest.Mock;
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
      scan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService, { provide: 'REDIS', useValue: redis }],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  describe('get', () => {
    it('should return parsed value when key exists', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: '1' }));

      const result = await service.get<{ id: string }>('key');

      expect(result).toEqual({ id: '1' });
    });

    it('should return null on cache miss', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.get('key')).resolves.toBeNull();
    });

    it('should return null instead of throwing when Redis is unavailable', async () => {
      redis.get.mockRejectedValue(new Error('connection refused'));

      await expect(service.get('key')).resolves.toBeNull();
    });

    it('should return null when stored value is corrupted JSON', async () => {
      redis.get.mockResolvedValue('{not-valid-json');

      await expect(service.get('key')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('should store serialized value with TTL', async () => {
      await service.set('key', { id: '1' }, 60);

      expect(redis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify({ id: '1' }),
        'EX',
        60,
      );
    });

    it('should use the default TTL when none is provided', async () => {
      await service.set('key', { id: '1' });

      expect(redis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify({ id: '1' }),
        'EX',
        CACHE_TTL.DEFAULT,
      );
    });

    it('should not throw when Redis is unavailable', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));

      await expect(service.set('key', { id: '1' })).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete the given key', async () => {
      await service.del('key');

      expect(redis.del).toHaveBeenCalledWith('key');
    });

    it('should not throw when Redis is unavailable', async () => {
      redis.del.mockRejectedValue(new Error('connection refused'));

      await expect(service.del('key')).resolves.toBeUndefined();
    });
  });

  describe('ttl', () => {
    it('should return remaining TTL for an existing key', async () => {
      redis.ttl.mockResolvedValue(120);

      await expect(service.ttl('key')).resolves.toBe(120);
    });

    it('should return null when the key does not exist', async () => {
      redis.ttl.mockResolvedValue(-2);

      await expect(service.ttl('key')).resolves.toBeNull();
    });

    it('should return null when Redis is unavailable', async () => {
      redis.ttl.mockRejectedValue(new Error('connection refused'));

      await expect(service.ttl('key')).resolves.toBeNull();
    });
  });

  describe('delByPattern', () => {
    it('should delete all keys matching the pattern via SCAN', async () => {
      redis.scan.mockResolvedValueOnce([
        '0',
        ['t:t1:products:list:a', 't:t1:product:1'],
      ]);

      await service.delByPattern('t:t1:products:*');

      expect(redis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        't:t1:products:*',
        'COUNT',
        100,
      );
      expect(redis.del).toHaveBeenCalledWith(
        't:t1:products:list:a',
        't:t1:product:1',
      );
    });

    it('should iterate until the cursor returns to 0', async () => {
      redis.scan
        .mockResolvedValueOnce(['42', ['k1']])
        .mockResolvedValueOnce(['0', ['k2']]);

      await service.delByPattern('pattern');

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenNthCalledWith(1, 'k1');
      expect(redis.del).toHaveBeenNthCalledWith(2, 'k2');
    });

    it('should not call DEL when no keys match', async () => {
      redis.scan.mockResolvedValue(['0', []]);

      await service.delByPattern('pattern');

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should not throw when Redis is unavailable', async () => {
      redis.scan.mockRejectedValue(new Error('connection refused'));

      await expect(service.delByPattern('pattern')).resolves.toBeUndefined();
    });
  });
});
