import { Injectable } from "@nestjs/common";
import type { JwtPayload } from "@/common/types";
import { env } from "@/config/env";
import { CacheService } from "@/infra/redis/cache.service";

const revokedBeforeKey = (userId: string) => `auth:revoked-before:${userId}`;

const nowInSeconds = () => Math.floor(Date.now() / 1000);

/** Makes a stateless JWT revocable. Per user, not per token — every event that calls it
 *  should end every session. **Fails open** on a Redis outage; see the README. */
@Injectable()
export class SessionRevocationService {
  constructor(private readonly cache: CacheService) {}

  async revokeAllFor(userId: string): Promise<void> {
    await this.cache.set(revokedBeforeKey(userId), nowInSeconds(), env.JWT_REFRESH_TTL_SECONDS);
  }

  /** True when this token was issued before the user's last revocation. A token with
   *  no `iat` counts as revoked — it cannot be proven to post-date anything. */
  async isRevoked(payload: JwtPayload): Promise<boolean> {
    const revokedBefore = await this.cache.get<number>(revokedBeforeKey(payload.sub));
    if (revokedBefore === null) return false;
    return (payload.iat ?? 0) < revokedBefore;
  }
}
