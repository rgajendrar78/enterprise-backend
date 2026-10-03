import { Injectable, Logger } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerException, type ThrottlerRequest } from "@nestjs/throttler";

/** Rate limiting is a protection, not a correctness requirement: an unreachable
 *  Redis lets the request through rather than failing the API. A real 429 still is. */
@Injectable()
export class ResilientThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ResilientThrottlerGuard.name);

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(request);
    } catch (error) {
      if (error instanceof ThrottlerException) throw error;
      this.logger.warn(`Rate-limit storage unavailable, allowing request: ${String(error)}`);
      return true;
    }
  }
}
