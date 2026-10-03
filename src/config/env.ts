import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

if (existsSync(".env")) process.loadEnvFile(".env");

function packageIdentity(): { name: string; version: string } {
  try {
    const raw = readFileSync(join(__dirname, "..", "..", "package.json"), "utf8");
    const { name, version } = JSON.parse(raw) as { name?: string; version?: string };
    return { name: name ?? "unknown", version: version ?? "unknown" };
  } catch {
    return { name: "unknown", version: "unknown" };
  }
}

const identity = packageIdentity();

const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .or(z.boolean());

/** Tuning knobs default everywhere — wrong is visible and harmless. Anything pointing
 *  at another system defaults outside production only, or a forgotten var boots healthy. */
export function buildEnvSchema(isProduction: boolean) {
  const corsOrigins = z.string().min(1);
  const redisUrl = z.string().min(1);

  return z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default("api"),
    CORS_ORIGINS: isProduction ? corsOrigins : corsOrigins.default("*"),

    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: bool.default(false),
    DATABASE_SSL_CA_PATH: z.string().min(1).optional(),
    DATABASE_LOGGING: bool.default(false),
    DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

    REDIS_URL: isProduction ? redisUrl : redisUrl.default("redis://localhost:6379"),
    REDIS_TLS: isProduction ? bool : bool.default(false),
    REDIS_KEY_PREFIX: z.string().default("app:"),

    AWS_S3_BUCKET: isProduction ? z.string().min(1) : z.string().min(1).default("test-bucket"),
    AWS_S3_REGION: isProduction ? z.string().min(1) : z.string().min(1).default("test-region"),
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    AWS_S3_PUBLIC_URL: z.string().url().optional(),

    SERVICE_NAME: z.string().min(1).default(identity.name),
    SERVICE_VERSION: z.string().min(1).default(identity.version),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  });
}

export const envSchema = buildEnvSchema(process.env.NODE_ENV === "production");

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment variables:\n${details}\n\n` +
      "See .env.example. Under NODE_ENV=production nothing that points at another " +
      "system falls back to a default — set it in the deployment environment.",
  );
}

export function assertProductionSafe(values: z.infer<typeof envSchema>): void {
  if (values.NODE_ENV !== "production") return;
  // `origin: true` + credentials reflects any origin back — never in production.
  if (values.CORS_ORIGINS === "*") {
    throw new Error("CORS_ORIGINS must list explicit origins when NODE_ENV=production");
  }
}

assertProductionSafe(parsed.data);

export const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
});
