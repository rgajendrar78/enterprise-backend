import { readFileSync } from "node:fs";
import { assertProductionSafe, buildEnvSchema, envSchema } from "@/config/env";

/** A key counts as documented whether set or commented out: `# FOO=` documents one
 *  whose default beats any example, and copying must not override it with "". */
function documentedKeys(): Set<string> {
  return new Set(
    readFileSync(".env.example", "utf8")
      .split("\n")
      .map((line) => line.replace(/^\s*#\s*/, ""))
      .filter((line) => line.includes("="))
      .map((line) => line.split("=")[0]?.trim() ?? ""),
  );
}

describe("env contract", () => {
  it("documents every variable in .env.example", () => {
    const documented = documentedKeys();
    const missing = Object.keys(envSchema.shape).filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });

  it("refuses a wildcard CORS origin in production only", () => {
    const values = envSchema.parse({
      DATABASE_URL: "postgres://x",
      JWT_SECRET: "x".repeat(32),
      CORS_ORIGINS: "*",
    });
    expect(() => assertProductionSafe(values)).not.toThrow();
    expect(() => assertProductionSafe({ ...values, NODE_ENV: "production" })).toThrow(/CORS/);
  });

  // Nothing that points at another system may fall back in production, or a
  // deployment missing a variable boots against localhost and looks healthy.
  it("has no defaults for external systems in production", () => {
    const result = buildEnvSchema(true).safeParse({
      DATABASE_URL: "postgres://x",
      JWT_SECRET: "x".repeat(32),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(["CORS_ORIGINS", "REDIS_URL", "REDIS_TLS"]),
    );
  });

  it("still defaults outside production, so `pnpm dev` needs only the two secrets", () => {
    const values = buildEnvSchema(false).parse({
      DATABASE_URL: "postgres://x",
      JWT_SECRET: "x".repeat(32),
    });
    expect(values.REDIS_URL).toBe("redis://localhost:6379");
    expect(values.CORS_ORIGINS).toBe("*");
  });

  it("rejects a short JWT secret and a missing database url", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "", JWT_SECRET: "too-short" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(["DATABASE_URL", "JWT_SECRET"]),
    );
  });
});
