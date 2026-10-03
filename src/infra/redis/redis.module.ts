import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { CacheService } from "@/infra/redis/cache.service";
import { REDIS } from "@/infra/redis/redis.constants";
import { REDIS_LIMITS } from "@/common/constants/runtime";
import { env } from "@/config/env";

const redisProvider = {
  provide: REDIS,
  useFactory: (): Redis =>
    new Redis(env.REDIS_URL, {
      keyPrefix: env.REDIS_KEY_PREFIX,
      maxRetriesPerRequest: REDIS_LIMITS.MAX_RETRIES_PER_REQUEST,
      connectTimeout: REDIS_LIMITS.CONNECT_TIMEOUT_MS,
      enableOfflineQueue: false,
      lazyConnect: false,
      ...(env.REDIS_TLS && { tls: {} }),
    }),
};

/** One connection for the whole app: cache, rate limiting and anything added later. */
@Global()
@Module({
  providers: [redisProvider, CacheService],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly cache: CacheService) {}

  async onApplicationShutdown(): Promise<void> {
    await this.cache.disconnect();
  }
}
