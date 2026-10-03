import { Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { CacheService } from "@/infra/redis/cache.service";

describe("CacheService", () => {
  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const cache = new CacheService(redis as unknown as Redis);
  const factory = jest.fn().mockResolvedValue({ id: 1 });

  beforeEach(() => jest.clearAllMocks());

  it("computes and stores on a miss, then serves from cache", async () => {
    redis.get.mockResolvedValueOnce(null);
    expect(await cache.wrap("k", 60, factory)).toEqual({ id: 1 });
    expect(redis.set).toHaveBeenCalledWith("k", '{"id":1}', "EX", 60);

    redis.get.mockResolvedValueOnce('{"id":1}');
    expect(await cache.wrap("k", 60, factory)).toEqual({ id: 1 });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("falls back to the factory when Redis is down, and says so", async () => {
    // Asserted, not merely silenced: degrading quietly is how a dead cache goes
    // unnoticed for a week.
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    redis.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    redis.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(cache.wrap("k", 60, factory)).resolves.toEqual({ id: 1 });

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
