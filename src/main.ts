import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "@/app.module";
import { HTTP_LIMITS } from "@/common/constants/runtime";
import { env } from "@/config/env";
import { withoutBootChatter } from "@/config/logger";
import { setupSwagger } from "@/config/swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(withoutBootChatter(app.get(Logger)));
  // Behind an ALB / ingress: without this, req.ip is the proxy and rate limiting
  // buckets every client together.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(compression());
  app.use(json({ limit: HTTP_LIMITS.BODY_SIZE }));
  app.use(urlencoded({ extended: true, limit: HTTP_LIMITS.BODY_SIZE }));
  app.enableCors({
    origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
  });
  app.setGlobalPrefix(env.API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableShutdownHooks();

  if (!env.isProduction) setupSwagger(app);

  const logger = app.get(Logger);
  trapProcessErrors(logger);

  await app.listen(env.PORT, "0.0.0.0");

  logger.log({
    port: env.PORT,
    path: `/${env.API_PREFIX}`,
    database: hostOf(env.DATABASE_URL),
    redis: hostOf(env.REDIS_URL),
    docs: env.isProduction ? "disabled" : `/${env.API_PREFIX}/docs`,
    node: process.version,
    pid: process.pid,
    message: "API ready",
  });
}

function hostOf(connectionUrl: string): string {
  try {
    const { host, pathname } = new URL(connectionUrl);
    return `${host}${pathname}`;
  } catch {
    // Never fall back to the raw string — it may carry a password.
    return "unparseable";
  }
}

function trapProcessErrors(logger: Logger): void {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "unhandled promise rejection — exiting",
      reason instanceof Error ? reason.stack : String(reason),
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception — exiting", error.stack);
    process.exit(1);
  });
}

void bootstrap();
