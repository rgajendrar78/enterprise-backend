# Architecture

Modular monolith: one deployable, one database, hard module boundaries.

```
HTTP → Throttler → JwtAuth → Permissions → ValidationPipe → Controller
                                                              → Service → Repository → Postgres
       ResponseInterceptor ← success envelope
       AllExceptionsFilter ← any throw
```

| Layer      | Owns                           | Never                          |
| ---------- | ------------------------------ | ------------------------------ |
| Controller | route, DTO, status, permission | business rules, database       |
| Service    | business rules, transactions   | `req`/`res`, HTTP status codes |
| Repository | persistence                    | business rules                 |

## Decisions

- **Global guards, opt-out routes.** New endpoints are protected by default;
  forgetting a decorator fails closed.
- **Fail closed on authorization, fail open on protection.** A missing
  permission is a 403; an unreachable rate-limit store is a logged warning, not
  a 500. Decide which of your dependencies are correctness and which are
  best-effort — and keep the best-effort ones out of the readiness probe.
- **Permissions, not roles, at the call site.** Survives an org-chart change.
- **One envelope, one error mapper.** No controller writes response shapes;
  Postgres unique/FK violations map to 409/400 in the filter.
- **Zod env at import time.** Config errors surface at boot with a list, not as
  `undefined` three hours later. No `ConfigService` indirection.
- **No dotenv, no @nestjs/config, no passport.** Node reads `.env`;
  `@nestjs/jwt` + a 40-line guard replaces three packages.
- **Migrations only, never `synchronize`.** Schema changes are reviewed code.
- **Soft delete by default**; the unique email index is partial so a deleted
  user frees their address. The trade is that restoring that row can now collide
  with whoever took the address — a 409, which is the honest outcome.
- **One `BaseCrudService`, writes left protected.** List/read/soft-delete/restore
  are inherited, driven by four column allow-lists (`sortableColumns`,
  `searchableColumns`, `filterableColumns`, `dateRangeColumns`) that are typed
  against the entity, so a typo fails the build rather than the filter;
  `saveNew`/`applyUpdate` stay protected so each module spells out its own
  `create(dto)`. One line per module buys DTO types that mean something and a
  write path you can read — a public generic `create<T>` invites a controller to
  skip password hashing.
- **`createdBy`/`updatedBy` via AsyncLocalStorage, not parameters.** Middleware
  opens a store, `JwtAuthGuard` fills in the id, a TypeORM subscriber stamps
  every write. Threading an `actorId` through every service signature forever is
  the same audit trail with a permanent tax, and one forgotten argument silently
  loses a row's history. They are plain uuid columns, not foreign keys: an audit
  trail has to outlive the account it names.
- **Password reset lives on the user row**, as a SHA-256 of the token plus an
  expiry, both `select: false`. Single-use falls out of clearing them, it
  survives a restart (unlike Redis), and it costs no join. A
  `password_reset_tokens` table earns its keep only once you need attempt history.
- **A stateless JWT, made revocable.** `SessionRevocationService` stamps
  `auth:revoked-before:<userId>` in Redis on every change that should end a
  session — password change or reset, deactivation, role change, delete — and
  both `JwtAuthGuard` and `/auth/refresh` reject tokens issued earlier. Per user,
  not per token, so one key covers every device. It **fails open**: a Redis
  outage must not log everybody out, and access tokens expire on their own within
  `JWT_ACCESS_TTL_SECONDS`. The cost of that trade is stated plainly — during a
  Redis outage a revoked token keeps working until it expires.
- **Self-lockout is a domain rule, not a permission.** No permission string can
  express "not on yourself" or "not the last admin", so both live in
  `UsersService`, where every path to the change already passes.
- **bcryptjs over argon2** — no native build in Alpine or CI.
- **One Redis client, three jobs** (rate limiting, cache-aside, session
  revocation), key-prefixed per service so several services can share one
  instance. Cached values are JSON, so cache projections — never entities with
  `Date` fields. A Redis outage degrades to a cache miss, and rate limiting fails
  open — a protection is not worth an outage. Redis is not in the readiness probe
  for the same reason: a single Redis failure must not deregister the whole fleet.
- **Cache invalidation belongs to the owning module.** `UsersService` writes and
  clears `users:profile:*`; no other module knows that key exists.

## Seams (where to extend without a rewrite)

| Want to change              | Touch                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| Storage for a module        | the `@InjectRepository` provider in that module only                            |
| Where permissions come from | `permissionsForRole` — one function, used by guard and login                    |
| A new error → HTTP mapping  | `normalize` in `AllExceptionsFilter`                                            |
| Response shape              | `ResponseInterceptor`                                                           |
| Rate-limit storage          | `ThrottlerModule.forRootAsync`; `ResilientThrottlerGuard` decides fail-open     |
| Caching                     | `CacheService` in `infra/redis` — cache-aside, invalidated by the owning module |
| When a session dies         | `SessionRevocationService` — call `revokeAllFor(userId)` from any write         |
| Config                      | the Zod schema in `config/env.ts`                                               |
| Sending the reset email     | `AuthService.forgotPassword` — one method, a log line today                     |
| What every module inherits  | `BaseCrudService` in `common/services`                                          |
| More per-request context    | `common/context/request-context.ts` and its middleware                          |

## Ready for, not carrying

Runs unchanged on ECS, Kubernetes or a VM: stateless, 12-factor config,
`0.0.0.0` bind, `trust proxy` set for ALB/ingress, liveness and readiness
probes split, JSON logs to stdout with `x-request-id`, `SIGTERM` drain,
non-root image. Migrations run as a release step, never at boot, so two
starting replicas cannot race. None of that required an extra dependency, and
none of it is AWS-specific.

## Not here on purpose

BullMQ queues, S3/email/SMS (`src/infra/<vendor>/`, next to `redis/`),
WebSockets, CQRS, multi-tenancy, E2E against a real database, a broker, a
service mesh, distributed tracing. Add each when a requirement arrives — every
one of them costs operational complexity that never goes away.

## Monolith → modular monolith → microservices

The app is already at stage two. Stage three is a **deployment** change, not a
rewrite, provided the rules below hold from day one. Do not skip ahead: most
"we need microservices" is a missing index, and premature extraction buys
network calls, partial failure and distributed transactions in exchange for
nothing.

### The rules that keep extraction mechanical

1. **A module's public surface is its exported service plus its `*.types.ts`.**
   Import those. Never another module's entity, repository or DTOs — an entity is
   a storage detail, and depending on it is what makes a module impossible to
   extract. `AuthService` takes `UserProfile`, not `User`, for exactly this
   reason.
2. **No cross-module joins.** Ask the owning service, or denormalise. A join
   across two modules' tables is a database-level coupling no interface can undo.
3. **A module owns its tables.** Nobody else reads or writes them.
4. **All state in Postgres or Redis; the process is disposable.** Nothing
   per-request lives in module scope, which is what makes replicas work — and
   what makes a module movable.
5. **Business rules live in the service**, never in a controller. What moves has
   to be the whole behaviour, not half of it.

### When a module has earned its own service

A separate scaling profile, release cadence or team — not a line count. Until one
of those is true, the module stays where it is.

### The extraction

1. Move `src/modules/<x>/` into a new repo from this template.
2. Give it its own database and migrate the tables it owns.
3. Replace the in-process call with an HTTP client carrying **the same method
   signatures** — the service body does not change, and callers keep compiling.
4. Keep the envelope and `errorCode` set identical, so downstream callers cannot
   tell the difference.

Only then add: broker or mesh, distributed tracing, an outbox or saga for what
used to be one transaction, per-service CI/CD. The monolith exists so you can
defer all of it.

### Cheapest fix first

Before extracting anything, in order: index the columns you filter and sort on ·
stop over-fetching · cache the hot read · move slow work to a queue · scale out
replicas · add a read replica. Measure before and after each. Steps and code are
in [ADD-A-MODULE.md](ADD-A-MODULE.md#when-the-module-needs-to-scale).
