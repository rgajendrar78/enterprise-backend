# CLAUDE.md

Rules for anyone — human or AI — writing code here. Context:
[ARCHITECTURE.md](docs/ARCHITECTURE.md). Recipe:
[ADD-A-MODULE.md](docs/ADD-A-MODULE.md). Detail:
[API.md](docs/API.md) · [OPERATIONS.md](docs/OPERATIONS.md).

## The standard

Every change is production-ready and review-ready: scalable, readable,
optimized, DRY, SOLID, secure, maintainable, simple — and **correct and secure
before anything else**.

- **Fit before you write.** Read the neighbouring module and match its layering,
  naming, placement and error handling. Use what exists (the table below) before
  adding anything new.
- **Module-local by default.** A helper, type or constant moves to `common/`
  only when a **second** module genuinely needs it — never in anticipation.
- **Think first.** Input validation, edge cases, failure modes, authz and data
  exposure, injection and untrusted input, N+1 queries and indexes, concurrency
  and transactions, statelessness, structured logging, migration safety and
  backward compatibility.
- **Simple over clever.** No speculative abstraction, no hack, no deprecated
  pattern, no dead code, no bare literal, no dependency for what a few lines do.
- **Minimal code, full type safety.** No `any`, no suppressed error, no weakened
  rule to pass a build — fix the cause.
- **Comments: at most 1–2 per file**, only where the _why_ is not evident —
  JSX `{/* */}` and doc-comments included; a lint directive is not a comment.
- **"Done" means verified**, not written: re-read your own diff for bugs, edge
  cases and side effects, then `pnpm verify`.
- **Ship nothing below 10/10 in a senior review.** If something cannot be fixed
  in scope, say so plainly rather than quietly shipping a 7/10.

## Non-negotiable

1. `pnpm verify` must pass before anything is "done".
2. knip fails on unused code — a new dependency lands with its first import.
   One deliberate exemption: exports used only inside their own file
   (`ignoreExportsUsedInFile`). Nothing else is excused, and
   `ignoreDependencies` is empty — keep it that way.
3. Never `synchronize: true`; schema changes are migrations.
4. Never hand-edit `pnpm-lock.yaml`. pnpm only.
5. No secrets in the repo; new config goes in the Zod schema **and**
   `.env.example`. If the value points at another system (a URL, a host, a
   credential, an origin), it gets **no default in production** — follow
   `REDIS_URL` in `config/env.ts`. Defaults are for tuning knobs only, or a
   forgotten deployment variable boots against localhost and looks healthy.
6. Conventional Commits — commitlint enforces them, and they are what release
   automation reads the day you add it.

## Changing what already ships

Nothing you add may break an existing API, module, migration, guard, test or
deploy. Before touching anything outside the module you are working in:

- **Extend, never rewrite.** A new feature fits the existing architecture. If it
  seems to need a new pattern, you have either missed the existing one or the
  requirement is genuinely new — say which.
- **Shared code has consumers.** Anything in `common/`, `database/` or `infra/`
  is used by more than one module: find every caller before you change a
  signature, and keep the old behaviour working. Add an overload or a new
  function rather than repurposing one.
- **The API is published.** Add fields, never rename or remove them; never
  repurpose an `errorCode`; never narrow a status for input that used to work. A
  breaking change is a new URI version, served beside the old one. See
  [API.md](docs/API.md#changing-the-contract-without-breaking-callers).
- **Migrations run against the old code.** Expand → backfill → contract, and
  every migration reversible, so the running release survives the deploy.
- **A production change needs a way back.** Know before you merge how it is
  rolled back — a revert, a reversible migration, or a flag. See
  [DEPLOY.md](docs/DEPLOY.md#rollout-safety-and-rollback).
- **Keep the module extractable.** Talk to other modules through their exported
  service only, never their entity, repository or DTOs, and never join across
  their tables. That one rule is what makes a future service split a move rather
  than a rewrite — and it is why premature microservices are unnecessary here.

## Principles, concretely

- **SRP** — controller = HTTP, service = rules, repository = storage. A file
  past ~300 lines is doing two jobs.
- **DRY with a boundary** — one implementation of a _decision_
  (`permissionsForRole`, `extractErrorMessage`, the envelope). Two DTOs that
  happen to look alike are not duplication; leave them.
- **OCP** — extend by adding a row to a map (`ROLE_PERMISSIONS`, the PG error
  codes in the filter), not by adding a `switch` at a call site.
- **DIP, pragmatically** — services inject TypeORM's `Repository`. That is the
  seam: swap `@InjectRepository(X)` for a custom provider token if you ever
  need a different store. Do not add repository interfaces for one
  implementation.
- **Fail fast, fail closed** — invalid config throws at boot; unknown request
  fields are rejected; a route with no `@Public()` is protected.
- **Stateless** — nothing per-request in module scope. Any instance can serve
  any request, which is what makes replicas, ECS tasks and pods work.

## Use what exists

| Need                          | Use                                                                        |
| ----------------------------- | -------------------------------------------------------------------------- |
| Config                        | `env` from `@/config/env`                                                  |
| **CRUD service**              | **extend `BaseCrudService<T>`**                                            |
| List query input              | extend `PaginationQueryDto`                                                |
| A `?flag=true` query field    | `@BooleanQuery()`                                                          |
| A `?dateFrom=` query field    | `@DateQuery()`                                                             |
| An email / a new password     | `@EmailField()` / `@PasswordField()`                                       |
| A `:id` route param           | `@IdParam()` — the uuid pipe is not optional                               |
| Paginated result              | `paginate(items, total, page, limit)`                                      |
| Safe ordering                 | `buildOrder(sort, ALLOWED, "createdAt")`                                   |
| Public route                  | `@Public()`                                                                |
| Authorization                 | `@RequirePermissions(PERMISSION.X)`                                        |
| Current user (controller)     | `@CurrentUser()`                                                           |
| Current user (service rule)   | `currentUserId()` from `common/context`                                    |
| Success message               | `@ResponseMessage("User created")`                                         |
| Timestamps, soft delete, who  | extend `BaseEntity`                                                        |
| Cache invalidation on write   | override `onChanged(id)`                                                   |
| Field limits                  | `VALIDATION` in `common/constants/validation.ts`                           |
| List sorting / search         | declare `sortableColumns` / `searchableColumns` — typed against the entity |
| List filters (`?role=admin`)  | declare `filterableColumns` — never build a where                          |
| A code the client branches on | `throw new AppException(ERROR_CODE.X)`                                     |
| Logging                       | the injected Nest `Logger`; never `console.*`                              |

## No magic values

Nothing static is written inline. Where it lives:

| Static thing                           | File                                 |
| -------------------------------------- | ------------------------------------ |
| Roles, permissions, page sizes         | `common/constants/app.constants.ts`  |
| Error codes and messages, PG SQLSTATEs | `common/constants/errors.ts`         |
| Success messages (`@ResponseMessage`)  | `modules/<name>/<name>.constants.ts` |
| Body limit, DB timeouts, health limits | `common/constants/runtime.ts`        |
| Field limits (mirrors the UI)          | `common/constants/validation.ts`     |
| Anything one module owns               | `modules/<name>/<name>.constants.ts` |
| Anything deployment-specific           | the Zod schema in `config/env.ts`    |

Module-owned values (bcrypt rounds, cache TTLs, sortable columns, per-route rate
limits) stay in that module — putting them in `common/` would couple modules
that should be extractable on their own.

## Where types live

| Type                                                  | Home                                  |
| ----------------------------------------------------- | ------------------------------------- |
| Used by 2+ modules (envelope, JWT payload, auth user) | `common/types/index.ts`               |
| A module's public contract (`UserProfile`)            | `modules/<name>/<name>.types.ts`      |
| Request shape                                         | `modules/<name>/dto/*.dto.ts`         |
| Table shape                                           | `modules/<name>/entities/*.entity.ts` |
| Union derived from a constant (`Role`)                | next to the constant                  |
| Used in exactly one file                              | that file, unexported                 |

**A module's public surface is its exported service plus its `*.types.ts`.**
Import those from another module; never its entity, repository or DTOs — an
entity is a storage detail, and depending on it is what makes a module
impossible to extract later. `AuthService` takes `UserProfile`, not `User`, for
exactly this reason.

## Designing a table

The schema is the design — get it right before the service, because it is the
most expensive thing to change later.

- Model the domain, not the endpoint. Normalized by default; denormalize only
  for a read problem you have measured.
- **The database enforces its own invariants** — `NOT NULL`, `UNIQUE`, `CHECK`,
  and a foreign key with an explicit `onDelete`. A rule kept only in a service
  is a rule the next writer skips.
- Index every foreign key and every column that `filterableColumns`,
  `sortableColumns` or `searchableColumns` exposes — and nothing else. A
  composite index matches the query's column order; a partial index carries its
  `WHERE` (see the email index).
- Right types: `timestamptz` in UTC, `decimal` or minor units for money — never
  float, a constant-backed enum for a status, one id strategy everywhere.
- Extend `BaseEntity` for id, timestamps, soft delete and audit columns. Never
  redeclare them on a table.
- Every migration is reversible, and a column that changes shape goes expand →
  backfill → contract, so the running release survives the deploy.
- A multi-write invariant runs in a transaction. Expect the concurrent case —
  a unique violation is a 409 through the PG error map, not a 500.
- Load relations explicitly, page every list. No N+1, no unbounded `find()`.

## Deleting, and who did it

- **Every delete is soft.** `BaseEntity` carries `deletedAt`, `remove()` calls
  `softDelete`, and TypeORM hides those rows from every read unless asked. A
  hard delete needs a reason and a migration, not a service method.
- **Soft delete frees unique columns.** The email index is partial
  (`WHERE deletedAt IS NULL`), so the address can be reused — and restoring the
  old row then fails as a 409. That is the correct answer; do not "fix" it by
  making the index total, which would block reuse forever.
- **Never write `createdBy`/`updatedBy` by hand.** `AuditSubscriber` stamps them
  from the request context. Null means no request was behind the write.
- **Nobody may lock themselves — or everybody — out.** Deactivating, deleting or
  demoting yourself is refused, and so is removing the last active admin
  (`UsersService.assertNotSelf` / `assertNotLastActiveAdmin`). Any new endpoint
  that can disable an account repeats those two checks.

## Do not

- Build a response object in a controller — the interceptor does it.
- `try/catch` to make an HTTP response — throw an `HttpException`.
- Import another module's repository or entity; call its exported service.
- Put business logic in a controller, or `req`/`res` in a service.
- Reject a login with a message that says which half was wrong. Check the
  password first, and only then explain a disabled account.
- Return a password reset token to the caller in production — email it. The
  non-production return value in `AuthService.forgotPassword` exists so you can
  click the link before a mailer is wired up.
- Write a bare literal for anything static — a number, an error code, a cache
  key, a rate limit, **a message**. Name it in the right constants file. Every
  sentence a person reads comes from a constant, success and failure alike: the
  envelope's `message` is what the client shows, so this side owns the wording
  and there is no second copy in the frontend to drift.
- Use `any`, `console.log`, or weaken a lint rule to pass a build.
- Add a package for what a few lines do.

## Adding a module

Full worked example: [ADD-A-MODULE.md](docs/ADD-A-MODULE.md).

`dto/`, `entities/`, `<name>.controller.ts`, `<name>.service.ts`,
`<name>.module.ts`. Then: migration, register in `app.module.ts`, add
permissions to `PERMISSION` + `ROLE_PERMISSIONS`, export the service if others
need it.

## Tests and size

`*.spec.ts` next to the source, contract tests in `test/`. Test what hurts when
it breaks: auth, permissions, money, dates, branches. Files: soft cap 300
lines, hard cap 500.
