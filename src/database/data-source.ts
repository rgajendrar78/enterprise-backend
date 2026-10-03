import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSource, type DataSourceOptions } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { DATABASE } from "@/common/constants/runtime";
import { env } from "@/config/env";
import { AuditSubscriber } from "@/database/subscribers/audit.subscriber";

function sslConfig(): PostgresConnectionOptions["ssl"] {
  if (!env.DATABASE_SSL) return false;
  if (!env.DATABASE_SSL_CA_PATH) return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ca: readFileSync(env.DATABASE_SSL_CA_PATH, "utf8"),
  };
}

/** Shared by the app and the TypeORM CLI, so migrations run against the config the app boots with. */
export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  url: env.DATABASE_URL,
  ssl: sslConfig(),
  entities: [join(__dirname, "..", "**", "*.entity.{ts,js}")],
  migrations: [join(__dirname, "migrations", "*.{ts,js}")],
  migrationsTableName: "migrations",
  subscribers: [AuditSubscriber],
  synchronize: false,
  logging: env.DATABASE_LOGGING,
  // Pool per instance: keep replicas × max below the server's max_connections.
  poolSize: env.DATABASE_POOL_SIZE,
  extra: {
    connectionTimeoutMillis: DATABASE.CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE.IDLE_TIMEOUT_MS,
    statement_timeout: DATABASE.STATEMENT_TIMEOUT_MS,
  },
};

export default new DataSource(dataSourceOptions);
