import { Module, ValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type { Redis } from "ioredis";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { ResilientThrottlerGuard } from "@/common/guards/resilient-throttler.guard";
import { PermissionsGuard } from "@/common/guards/permissions.guard";
import { ResponseInterceptor } from "@/common/interceptors/response.interceptor";
import { RequestContextModule } from "@/common/context/request-context.module";
import { SessionRevocationModule } from "@/common/services/session-revocation.module";
import { DATABASE } from "@/common/constants/runtime";
import { env } from "@/config/env";
import { loggerConfig } from "@/config/logger";
import { dataSourceOptions } from "@/database/data-source";
import { REDIS } from "@/infra/redis/redis.constants";
import { RedisModule } from "@/infra/redis/redis.module";
import { S3Module } from "@/infra/s3/s3.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { HealthModule } from "@/modules/health/health.module";
import { UsersModule } from "@/modules/users/users.module";

@Module({
  imports: [
    // First, so its middleware opens the async-local store *outside* the
    // logger's: a request that finishes outside the store loses its requestId.
    RequestContextModule,
    LoggerModule.forRoot(loggerConfig),
    RedisModule,
    SessionRevocationModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: env.THROTTLE_TTL_SECONDS * 1000, limit: env.THROTTLE_LIMIT }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      retryAttempts: DATABASE.RETRY_ATTEMPTS,
      retryDelay: DATABASE.RETRY_DELAY_MS,
    }),

    S3Module,
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Order matters: rate limit, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ResilientThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
