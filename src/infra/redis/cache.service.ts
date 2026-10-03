import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "@/infra/redis/redis.constants";

/** Cache-aside over the shared client. Values are JSON, so cache projections, not
 *  entities with `Date` fields. An unreachable Redis costs a round trip, never a 500. */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`cache get failed for ${key}: ${String(error)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`cache set failed for ${key}: ${String(error)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length) await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(`cache del failed: ${String(error)}`);
    }
  }

  /** Read-through: return the cached value, or compute, store and return it. */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  ping(): Promise<string> {
    return this.redis.ping();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
