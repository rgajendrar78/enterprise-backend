# Operations

Logging, failure handling, what Postgres and Redis are each responsible for, and
the supply-chain gates. Everything here is behaviour you inherit — no feature has
to think about it.

## Logging

One JSON object per line on **stdout** — what a file sink, Docker's `awslogs`
driver and the CloudWatch agent all read. Nothing writes files itself; that is
the platform's job, and it is why the app runs unchanged on ECS, Kubernetes or a
VM.

```jsonc
{
  "level": "warn", // a word, not 50 — Insights filters read plainly
  "time": "2026-08-12T08:09:06.961Z",
  "service": "enterprise-api", // several services can share one log group
  "version": "0.1.0", // ties an error spike to a deploy
  "env": "development",
  "req": { "method": "GET", "url": "/api/v1/users/3f2b" },
  "res": { "statusCode": 404 },
  "responseTime": 4,
  "requestId": "browser-trace-abc123", // the caller's id, kept end to end
  "userId": "da20c7cd-…",
  "errorCode": "NOT_FOUND",
  "errorMessage": "User not found",
  "message": "request completed",
}
```

- **Local is production** — same fields everywhere, so a bug you reproduce
  locally shows what production would have shown.
- **`requestId` and `userId` are on every line, for free.** Middleware opens an
  `AsyncLocalStorage` store, the JWT guard drops the user id in, a pino `mixin`
  reads both — nobody threads a logger through. A caller's `x-request-id` is kept
  and echoed, so a browser, an ALB and this service share one id; one that does
  not look like an id is replaced, because it lands in every line and log
  injection is real.
- **Readability is a shell concern, never a config one.** `pnpm dev:pretty` pipes
  the output through `pino-pretty`, a devDependency the production image never
  installs and that nothing in `src/` names. Referenced from runtime config it
  would be a `LOG_PRETTY=true` away from killing production at boot on a missing
  module — and its output is not valid JSON per line, so CloudWatch would stop
  parsing the fields.
- **Volume is a design decision.** Pino's default serializers write every header
  on every line — **1,476 bytes per request here, 73% of it repeated CSP
  headers**. The trimmed ones in `config/logger.ts` bring that to **342 bytes,
  76% less**: at 10 req/s, 1.2 GB/day of CloudWatch ingest becomes 281 MB. That
  file decides the bill.
- **Secrets never reach a line.** The serializers keep headers and bodies out
  entirely; `LOGGING.SECRET_FIELDS` redacts the usual names at any depth as a
  second layer, for the day someone logs an object by hand.

| Event           | Level   | Lines                                                                            |
| --------------- | ------- | -------------------------------------------------------------------------------- |
| 2xx/3xx request | `info`  | 1                                                                                |
| 4xx request     | `warn`  | 1, with `errorCode` — the caller's mistake, and the line already says everything |
| 5xx request     | `error` | 2 — the access line, plus the stack, which is the whole reason to look           |
| Health probe    | —       | 0 — they run every few seconds and say nothing                                   |

### Collecting it

**Something has to collect stdout or the logs die with the process** — on a bare
box, an SSH disconnect is enough. Neither option needs an app change:

| Where you run             | Collector                                                                     | Rotation                     |
| ------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| ECS / EKS / any container | the `awslogs` log driver                                                      | nothing touches disk         |
| Plain EC2 or a VM         | **systemd** captures stdout into journald, CloudWatch agent reads the journal | `RuntimeMaxUse=` in journald |

The deploy in `deploy-ghcr.yml` runs the container with `json-file` logging capped at
`10m × 3` files, so a long-lived instance cannot fill its disk on logs alone.

`Restart=always` in a unit file is not optional: `trapProcessErrors` exits 1 on
purpose when the process reaches an unknown state. **If you ever redirect to a
file yourself** (`node dist/main.js > app.log`), that file needs `logrotate` with
`size`, `rotate` and `compress` the same day — writing is cheap (~281 MB/day at
10 req/s), but a logfile without rotation is a scheduled outage, and a full disk
takes the database and often SSH with it. **Set a retention policy on the
CloudWatch log group** too: it defaults to _Never expire_, which is how a bill
grows quietly; 30 days hot, older exported to S3, suits an admin API.

To follow one incident, run this, then take the `x-request-id` from the response
header (or the user's screenshot) and `filter requestId = "…"` for every line of
that request in order, browser and API:

```
fields @timestamp, level, message, req.url, res.statusCode, requestId, userId
| filter level = "error" | sort @timestamp desc
```

## Exception handling

Three layers, none of which a feature has to think about:

1. **`AllExceptionsFilter`** (global) is the only place an error becomes a
   response. Nest exceptions, Postgres unique/FK violations and anything unknown
   all leave as the same envelope with a stable `errorCode`.
2. **`AppException`** raises an error the _client must branch on_ —
   `throw new AppException(ERROR_CODE.ACCOUNT_DISABLED)`. One entry in
   `common/exceptions/app.exception.ts` defines the code, the status and the
   sentence together, so they cannot drift apart across call sites. Ordinary
   failures stay ordinary: a missing row is `NotFoundException`, a bad DTO is the
   validation pipe.
3. **`trapProcessErrors`** in `main.ts` catches what escapes the request cycle —
   a rejected promise nobody awaited, a throw from a timer. It logs and exits
   non-zero deliberately: a process in an unknown state must not keep serving
   traffic, and the orchestrator replaces it in seconds. Without it, a container
   just "restarts sometimes".

## Postgres and Redis

Postgres is the source of truth (TypeORM, migrations only). Pool, timeouts and
boot retries are in `database/data-source.ts` and `app.module.ts` — keep
`replicas × DATABASE_POOL_SIZE` under the server's `max_connections`.

### AWS RDS PostgreSQL

In production the database is an RDS PostgreSQL instance. The connection uses the
same `DATABASE_URL` — only the host changes. Two additional variables control
TLS:

| Variable               | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `DATABASE_SSL=true`    | Enables TLS on the connection                                               |
| `DATABASE_SSL_CA_PATH` | Path to the RDS CA bundle PEM — enables `rejectUnauthorized: true` (verify) |

The Docker image bakes the AWS global CA bundle at
`/app/certs/rds-combined-ca-bundle.pem`. Without `DATABASE_SSL_CA_PATH` the
connection still uses TLS but does **not** verify the server certificate
(`rejectUnauthorized: false`) — acceptable for a transition, not for production.

**Pool sizing against RDS.** `max_connections` is a function of instance memory:
`db.t3.micro` ≈ 25, `db.t3.medium` ≈ 82, `db.r5.large` ≈ 840. Keep
`replicas × DATABASE_POOL_SIZE` well under that number, leaving headroom for
migrations and monitoring connections.

### ElastiCache Redis

Redis is a single shared `ioredis` client (`infra/redis/`) doing three jobs:

| Job                    | Where                             | Behaviour                                                                     |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| **Rate limiting**      | `ResilientThrottlerGuard`         | Counters in Redis, so the limit is per client across replicas                 |
| **Cache-aside**        | `CacheService.wrap(key, ttl, fn)` | `UsersService.findProfile` is the worked example — 60 s, invalidated on write |
| **Session revocation** | `SessionRevocationService`        | One key per user; makes a stateless JWT revocable                             |

In production Redis is an ElastiCache (Redis OSS) node. The connection uses
`REDIS_URL` — set it to the primary endpoint. For in-transit encryption:

| Variable    | Purpose                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `REDIS_TLS` | `true` to negotiate TLS — required when ElastiCache in-transit encryption is on |

ElastiCache AUTH tokens go in the URL: `rediss://:AUTH_TOKEN@host:6379`. The
`rediss://` scheme makes ioredis enable TLS automatically; `REDIS_TLS=true` is
the explicit fallback for `redis://` URLs behind a TLS-terminating proxy.

`REDIS_KEY_PREFIX` namespaces every key, so several services can share one
instance. Cached values round-trip through JSON — cache **projections**, never
entities with `Date` fields.

**A Redis outage must not take the API down.** Rate limiting fails open (the
request is allowed, a warning is logged), the cache degrades to a miss,
revocation checks pass, and Redis is deliberately **not** in the readiness probe
— one Redis blip would otherwise pull every pod out of the load balancer at once.
Probes also skip rate limiting, so an orchestrator polling them can never trip a
limit or restart a healthy pod. Failing open is the deliberate half of that
trade: during an outage a revoked token keeps working until it expires, which
beats logging out every user instead.

### VPC placement

The app, RDS instance and ElastiCache node must be in the same VPC (or peered
VPCs). ElastiCache is not publicly addressable — there is no "open to the
internet" option. Security groups: the app's SG must be allowed inbound on
port 5432 (RDS) and 6379 (ElastiCache) in those resources' SGs.

## Production gates

`pnpm build` is a few seconds at roughly 450 MB peak and emits under 1 MB (`tsc`,
incremental — warm and cold are the same); the whole `verify` gate is well under
a minute. Those are a baseline for spotting regressions on a developer machine,
not a promise. If a step starts taking minutes, look at what you added; do not
delete the step.

- **pnpm only** — `preinstall` rejects npm/yarn/bun and prints the command to run
  instead; `.npmrc` has `engine-strict`, so the **Node** version is enforced too.
  `engines` deliberately does not list npm or yarn: an unsatisfiable range there
  makes npm resolve the entire tree first (~a minute of silent spinner) and then
  blame your Node version, instead of reaching `preinstall` and naming pnpm.
- **Env** — Zod-validated at import; a bad value fails boot, and a test fails if
  `.env.example` misses a key. Production is stricter twice over, both in
  `config/env.ts`: **no defaults for anything pointing at another system**
  (`REDIS_URL`, `CORS_ORIGINS` default outside production only — a default there
  lets a deployment that forgot a variable boot against localhost and report
  itself healthy), and **values fine locally but a hole in production** are
  rejected by `assertProductionSafe` (`CORS_ORIGINS=*` reflects any origin back
  with credentials).
- **CI/hooks** — `pnpm verify` in CI; pre-commit lint-staged, commit-msg
  commitlint, pre-push typecheck + lint + test. **knip** fails on an unused file,
  export or dependency. **Migrations only** — `synchronize` is false, asserted by
  a test.
- **Supply chain** — `pnpm audit` at moderate+ in `verify`, in CI, and weekly on
  a schedule, so a new advisory against an existing dependency is caught without
  a commit. Transitive fixes go in `pnpm-workspace.yaml` → `overrides` with an
  advisory reference. Plus **allowBuilds** (install-script allow-list),
  **minimumReleaseAge** 1 day so a freshly compromised release cannot be pulled
  in, and grouped weekly Dependabot PRs.

**Where the edge is**, so you know what none of that covers: `audit` sees
_published_ advisories only — a zero-day or an unreported compromise passes.
Raise `minimumReleaseAge` (7 days is common in enterprises, at the cost of slower
security patches) and turn on Dependabot **alerts** in repo settings (a GitHub
toggle, not a file). A new package is a decision: check who publishes it, whether
it needs install scripts, and whether you need it at all.
