import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject('REDIS')
    private readonly redis: Redis,
  ) {}

  async set<T>(key: string, value: T, ttl = 300): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      this.logger.error(`Failed to set cache key: ${key}`, error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const item = await this.redis.get(key);

      if (item === null) {
        return null;
      }

      return JSON.parse(item) as T;
    } catch (error) {
      this.logger.error(`Failed to get cache key: ${key}`, error);
      return null;
    }
  }

  async ttl(key: string): Promise<number | null> {
    try {
      const ttl = await this.redis.ttl(key);

      if (ttl === -2) {
        return null;
      }

      return ttl;
    } catch (error) {
      this.logger.error(`Failed to get TTL for cache key: ${key}`, error);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete cache key: ${key}`, error);
    }
  }
}
