import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from '../common/services/cache.service';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        });
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class RedisModule {}
