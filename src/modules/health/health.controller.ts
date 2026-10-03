import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
  type HealthCheckResult,
} from "@nestjs/terminus";
import { HEALTH } from "@/common/constants/runtime";
import { Public } from "@/common/decorators";

@ApiTags("Health")
@Public()
@SkipThrottle()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get("live")
  live(): { status: string } {
    return { status: "ok" };
  }

  /** Readiness: can this instance serve traffic? Redis is deliberately absent — one
   *  blip must not pull every pod out of the load balancer. */
  @Get("ready")
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck("database", { timeout: HEALTH.DB_PING_TIMEOUT_MS }),
      () => this.memory.checkHeap("memory_heap", HEALTH.HEAP_LIMIT_BYTES),
    ]);
  }
}
