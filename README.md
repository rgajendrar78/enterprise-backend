# Enterprise Backend

NestJS 11 + PostgreSQL + Redis. A **modular monolith** — one deployable, one
database, hard module boundaries — built so a module can be extracted into its
own service later without a rewrite.

Auth, RBAC, validation, error handling, structured logging, pagination, health
probes, CI and a staging/production deploy are already wired. You add modules.

## Architecture

```
                       ┌──────────────── src/modules/<feature>/ ────────────────┐
HTTP ─▶ Throttler ─▶ JwtAuth ─▶ Permissions ─▶ ValidationPipe ─▶ Controller     │
                                                                     │          │
                                                                  Service ──────┼─▶ Postgres
                                                                     │          │   (TypeORM)
                       └─────────────────────────────────────────────┘          │
                                                                                │
       ResponseInterceptor ◀── success ──┐                          Redis ◀──────┘
       AllExceptionsFilter ◀── any throw ┘                   rate limit · cache
                                                             · session revocation
```

| Layer      | Owns                           | Never                          |
| ---------- | ------------------------------ | ------------------------------ |
| Controller | route, DTO, status, permission | business rules, database       |
| Service    | business rules, transactions   | `req`/`res`, HTTP status codes |
| Repository | persistence                    | business rules                 |

Routes are `/api/v1/<resource>`. Every response is
`{ success, message, data, meta? }`. Full reasoning:
**[ARCHITECTURE.md](docs/ARCHITECTURE.md)** · contract: **[API.md](docs/API.md)**.

## Quick start

```bash
corepack enable && pnpm install
cp .env.example .env           # DATABASE_URL, REDIS_URL, JWT_SECRET, SEED_ADMIN_*
docker compose up -d           # postgres:17 + redis:8, bound to 127.0.0.1
pnpm migration:run && pnpm seed
pnpm dev                       # http://localhost:4000/api
```

Swagger at `/api/docs` (non-production). The seeded admin is whatever
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` you set — there is no default, in any
environment. Rename `name` in `package.json` — the only rename required.

Node 24 (`.nvmrc`), pnpm 11.5 (`packageManager`). Both are enforced: `preinstall`
rejects npm/yarn/bun and `.npmrc` sets `engine-strict`.

## Where new code goes

```
src/
├── main.ts app.module.ts   # bootstrap; global pipe, filter, interceptor, guards
├── config/                 # env (Zod), logger, swagger
├── common/                 # cross-cutting ONLY — used by 2+ modules
├── database/               # data-source, BaseEntity, migrations, seeds, subscribers
├── infra/redis/            # vendor integrations: one client + CacheService
└── modules/<feature>/      # module + controller + service + dto/ + entities/
```

| Adding                             | Goes in                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| A feature (endpoints + rules)      | `modules/<feature>/` — everything it owns                |
| A constant only that feature uses  | `modules/<feature>/<feature>.constants.ts`               |
| A helper a **second** module needs | `common/utils/` — not before the second                  |
| A third-party integration (S3, …)  | `infra/<vendor>/`, next to `redis/`                      |
| A schema change                    | a migration — never `synchronize`                        |
| Config                             | the Zod schema in `config/env.ts` **and** `.env.example` |

**A module's public surface is its exported service plus its `*.types.ts`.**
Never import another module's entity, repository or DTOs — that is the rule that
keeps extraction to a service mechanical. Recipe:
**[ADD-A-MODULE.md](docs/ADD-A-MODULE.md)**.

## Environment

Every variable is in [`.env.example`](.env.example) with its meaning, validated
by Zod in `config/env.ts` at import — a bad value fails boot with a list, not
`undefined` three hours later.

Under `NODE_ENV=production` **nothing that points at another system falls back to
a default**: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` and `CORS_ORIGINS` must be
set or the process refuses to start and names them. Tuning knobs (`PORT`, TTLs,
`LOG_LEVEL`, pool and throttle sizes) default everywhere. No secret is ever
committed; runtime credentials live on the instance, not in the repo.

## Commands

| Command                                 | Does                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`          | watch / compile / run `dist/`                                    |
| `pnpm dev:pretty`                       | same as `dev`, piped through `pino-pretty`                       |
| `pnpm verify`                           | typecheck → lint → format → knip → test → audit → build (**CI**) |
| `pnpm test` / `test:watch` / `test:cov` | jest                                                             |
| `pnpm lint:fix` / `format`              | fix lint / write prettier                                        |
| `pnpm migration:generate <path>`        | diff entities into SQL — **read it before committing**           |
| `pnpm migration:run` / `revert`         | apply / roll back one                                            |
| `pnpm seed`                             | idempotent admin seed                                            |

`pnpm verify` is the gate: if it passes, CI passes.

## Workflow

1. Branch off `develop`.
2. Write the change inside one module boundary. Read
   **[CLAUDE.md](CLAUDE.md)** first — it is the rule set for humans and AI alike.
3. `pnpm verify` green. Hooks help: pre-commit runs lint-staged, commit-msg runs
   commitlint (**Conventional Commits**), pre-push runs typecheck + lint + test.
4. PR into `develop`. CI runs `pnpm verify` on the exact commit. Review against
   CLAUDE.md — inline literals, business logic in a controller, a cross-module
   import that reaches past an exported service, an unreviewed migration.
5. Merge to `develop` → staging. Merge `develop` → `main` → production.

Tests are `*.spec.ts` beside the source, contract tests in `test/`. Test what
hurts when it breaks: auth, permissions, money, dates, branches.

## CI/CD

```
commit ─▶ CI (pnpm verify) ─▶ docker build ─▶ registry ─▶ migrate ─▶ roll ─▶ health check
                                                                            │
                                                      revert + push ◀───────┘ on failure
```

| Workflow                | Runs on                    | Does                                             |
| ----------------------- | -------------------------- | ------------------------------------------------ |
| `ci.yml`                | every PR, weekly, dispatch | `pnpm verify`                                    |
| `deploy-staging.yml`    | push to `develop`          | CI, then **staging**                             |
| `deploy-production.yml` | push to `main`             | CI, then **production**                          |
| `deploy.yml`            | called with an environment | build → ECR → migrate → roll the service → smoke |
| `deploy-ghcr.yml`       | called with an environment | build → GHCR → migrate → restart → smoke test    |
| `deploy-ec2.yml`        | called with an environment | build → tarball → migrate → PM2 reload → smoke   |

Each deploy calls the real `ci.yml` first, so only a commit that passed ships.
The environment is an **input**, so staging and production differ by one
argument. Migrations run as a release step in a throwaway container — never at
boot, where replicas would race. Three targets, one line apart in the caller —
**`deploy.yml`** (ECR + ECS on EC2, OIDC, rolling with auto-rollback) is the
production one. Every variable to set, and how to roll back:
**[DEPLOY.md](docs/DEPLOY.md)**.

## Troubleshooting

| Symptom                                | Cause and fix                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `This repo is pnpm-only`               | You ran npm/yarn/bun. `corepack enable && pnpm install`.                                 |
| `Invalid environment variables`        | Copy `.env.example`; `JWT_SECRET` needs 32+ characters.                                  |
| Docker port bind fails (5432/6379)     | Postgres/Redis already running locally. Remap in `docker-compose.yml` and `.env`.        |
| Production boot refuses `CORS_ORIGINS` | Wildcard origins are rejected in production — list them explicitly.                      |
| A client signs in, then 401s           | Its API base URL must carry the version: `http://localhost:4000/api/v1`.                 |
| `pnpm verify` fails on knip            | Something is unused. Import it or delete it — do not add an ignore.                      |
| Migration writes an unexpected `DROP`  | TypeORM diffs against the **live** database. Read the SQL; re-run after `migration:run`. |

Log lines carry `requestId` and `userId` — take `x-request-id` from the response
header and filter on it to follow one request end to end. More:
**[OPERATIONS.md](docs/OPERATIONS.md)**.

## Docs

| File                                         | For                                                             |
| -------------------------------------------- | --------------------------------------------------------------- |
| **[CLAUDE.md](CLAUDE.md)**                   | The rules — every developer, reviewer and AI reads this first   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, decisions, seams, monolith → microservices path         |
| [docs/API.md](docs/API.md)                   | Envelope, list query, error codes, auth and permissions         |
| [docs/ADD-A-MODULE.md](docs/ADD-A-MODULE.md) | Worked recipe for a new module                                  |
| [docs/OPERATIONS.md](docs/OPERATIONS.md)     | Logging, error handling, Postgres/Redis behaviour, supply chain |
| [docs/DEPLOY.md](docs/DEPLOY.md)             | Environments, variables, rollout and rollback                   |

Other assistants: point them at [AGENTS.md](AGENTS.md), which forwards to
`CLAUDE.md`. Companion UI: the `enterprise-frontend` template, which speaks this
envelope with no adapter.
