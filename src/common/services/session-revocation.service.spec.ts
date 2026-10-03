import { ROLE } from "@/common/constants/app.constants";
import { SessionRevocationService } from "@/common/services/session-revocation.service";
import type { JwtPayload } from "@/common/types";
import type { CacheService } from "@/infra/redis/cache.service";

describe("SessionRevocationService", () => {
  const cache = { get: jest.fn(), set: jest.fn() };
  const service = new SessionRevocationService(cache as unknown as CacheService);

  const at = (issuedAt: number): JwtPayload => ({
    sub: "1a2b",
    email: "admin@example.com",
    role: ROLE.ADMIN,
    type: "access",
    iat: issuedAt,
  });

  beforeEach(() => jest.clearAllMocks());

  it("lets a token through when the user has never revoked", async () => {
    cache.get.mockResolvedValue(null);

    await expect(service.isRevoked(at(1_000))).resolves.toBe(false);
  });

  it("rejects a token issued before the revocation and keeps one issued after", async () => {
    cache.get.mockResolvedValue(1_000);

    await expect(service.isRevoked(at(999))).resolves.toBe(true);
    await expect(service.isRevoked(at(1_001))).resolves.toBe(false);
  });

  // Nothing proves it post-dates the revocation, so it cannot be trusted.
  it("rejects a token with no issued-at claim", async () => {
    cache.get.mockResolvedValue(1_000);
    const { iat: _iat, ...withoutIat } = at(1_000);

    await expect(service.isRevoked(withoutIat)).resolves.toBe(true);
  });

  // Failing closed would turn one Redis blip into a total outage; `CacheService`
  // already logs the failure, and access tokens expire on their own.
  it("fails open when Redis is unreachable", async () => {
    cache.get.mockResolvedValue(null);

    await expect(service.isRevoked(at(1))).resolves.toBe(false);
  });

  it("stamps the revocation with a bounded lifetime", async () => {
    await service.revokeAllFor("1a2b");

    const [key, value, ttl] = cache.set.mock.calls[0] as [string, number, number];
    expect(key).toContain("1a2b");
    expect(value).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
    expect(ttl).toBeGreaterThan(0);
  });
});
