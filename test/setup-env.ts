// Loaded before any module — `src/config/env.ts` validates at import time.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-zod-32";
