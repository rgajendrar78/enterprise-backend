// TypeORM's generated code fails this repo's lint, and uuid_generate_v4() needs
// the uuid-ossp extension. This fixes both — gen_random_uuid() is built into PG 13+.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "src/database/migrations";
const target = process.argv[2];

if (!target) {
  console.error("Usage: pnpm migration:generate src/database/migrations/<name>");
  process.exit(1);
}

const run = (args) => execFileSync("pnpm", ["exec", ...args], { stdio: "inherit" });

run([
  "ts-node",
  "-r",
  "tsconfig-paths/register",
  "./node_modules/typeorm/cli.js",
  "migration:generate",
  "-d",
  "src/database/data-source.ts",
  target,
]);

const newest = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".ts"))
  .sort()
  .at(-1);
const path = join(MIGRATIONS_DIR, newest);

writeFileSync(
  path,
  readFileSync(path, "utf8").replaceAll("uuid_generate_v4()", "gen_random_uuid()"),
);
run(["prettier", "--write", path]);
run(["eslint", "--fix", path]);

console.warn(`\n  ${path}\n  Read the SQL before committing it.\n`);
