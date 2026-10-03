# API contract

Routes are `/api/v1/<resource>`, JSON camelCase both ways, bearer tokens — no
cookies, no server sessions. Health is version-neutral: `/api/health/live`
(touches nothing) and `/api/health/ready` (database + heap). Swagger at
`/api/docs` outside production.

## Envelope

```jsonc
// success — `meta` on lists only
{ "success": true, "message": "User created", "data": {}, "meta": { … } }

// failure
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_FAILED",
  "details": ["email must be an email"],
  "path": "/api/v1/users",
  "timestamp": "2026-08-12T08:09:06.961Z",
}
```

No controller writes this shape — `ResponseInterceptor` builds the success half
and `AllExceptionsFilter` the failure half.

`errorCode` is the stable half of a failure; **clients branch on it, never on the
message**. Beyond the HTTP names: `VALIDATION_FAILED`, `DUPLICATE_RESOURCE`,
`FOREIGN_KEY_VIOLATION`, `ACCOUNT_DISABLED`, `INVALID_RESET_TOKEN`. Add an entry
to `common/exceptions/app.exception.ts`, then
`throw new AppException(ERROR_CODE.YOURS)` — one place defines the code the client
switches on, the status the browser sees and the sentence a person reads, so they
cannot drift apart across call sites.

Every sentence a person reads comes from a constant on this side. The envelope's
`message` is what the client shows, so there is no second copy in the frontend to
drift out of step.

## List queries

**Every list endpoint takes the same query string**, because every list service
inherits `BaseCrudService`:

```
?page=1&limit=10&sort=createdAt:desc&search=ada&includeDeleted=false&<filters>
```

Four allow-lists per module decide what that means — constants, no code:

| Declare             | Gives you                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sortableColumns`   | `?sort=field:asc\|desc`; the first entry is the default, and a column that is not listed falls back to it — direction included |
| `searchableColumns` | `?search=` matched across them, OR-ed                                                                                          |
| `filterableColumns` | `?role=admin&isActive=true` exact matches                                                                                      |
| `dateRangeColumns`  | `?createdAtFrom=&createdAtTo=`, either end, inclusive                                                                          |

Allow-lists because the key reaches the query builder: a caller must not choose
it. Validating the _value_ stays the DTO's job, and an unknown param is rejected
by the validation pipe before it gets there (`forbidNonWhitelisted`) — two layers.

A date range is an allow-list rather than code: declare `createdAt` and the base
reads `?createdAtFrom=` / `?createdAtTo=` by the `<column>From` / `<column>To`
convention. Either end alone works, and the same date at both ends is a single
day — each bound is a whole day, so a bare date would have matched only rows
created at exactly midnight. Filters even that cannot express — the current
tenant, "mine only" — go through the second argument of `findAll`.

## Auth

`POST /api/v1/auth/login` → `{ accessToken, refreshToken, user }`. `JwtAuthGuard`
is global: **every route is protected unless marked `@Public()`**.

```ts
@RequirePermissions(PERMISSION.USERS_CREATE)
create(@Body() dto: CreateUserDto) {}
```

Roles are bags of permissions in `common/constants/app.constants.ts`, resolved by
`permissionsForRole` — the one function the guard and the token issuer share.
Privileged fields get their own permission and endpoint: role changes are
`PATCH /users/:id/role` + `users:manage-role`, never part of a generic update.

| Password endpoint            | Who         | Notes                                                         |
| ---------------------------- | ----------- | ------------------------------------------------------------- |
| `POST /auth/forgot-password` | anyone      | Rate limited. Same answer for a known and an unknown address. |
| `POST /auth/reset-password`  | link holder | Single use, 30-minute expiry.                                 |
| `POST /auth/change-password` | signed in   | Verifies the current password first.                          |

**A 401 means two different things, and clients rely on the difference.** From
`/auth/login`, `/auth/forgot-password` or `/auth/reset-password` it answers the
form — the credentials were wrong — and the envelope's `message` is what the
person should read. From any other route it means the session is over. A client
that treats every 401 as an expiry signs the person out of a form they were still
filling in.

Only a **SHA-256 of the reset token** is stored, in two `select: false` columns,
cleared the moment it is used — a leaked database row is not a working reset
link. The token is 32 random bytes. **There is no mailer:** the link is logged,
and outside production also returned in the response so you can click through.
Wire your mailer in `AuthService.forgotPassword` and delete that return value —
handing a reset token to an anonymous caller is account takeover.

**A JWT here is revocable.** Signing one is not a promise it works forever: a
password change or reset, a deactivation, a role change and a delete each stamp
`auth:revoked-before:<userId>` in Redis, and both the guard and `/auth/refresh`
reject any token issued earlier. Without it, changing a compromised password
would leave the stolen session running until it expired. Per user rather than per
token, so one key covers every device, and it **fails open** like rate limiting —
a Redis outage must not log everybody out, and access tokens expire on their own
within `JWT_ACCESS_TTL_SECONDS`. Signing out stays client-side: the token is
short-lived and nothing server-side needs to happen.

**Nobody can lock everybody out.** Two rules in `UsersService`, both tested: you
cannot deactivate, delete or demote **yourself**, and the **last active admin**
cannot be either — a manager holds `users:update`, so without that, one call
empties the building. A deactivated user who signs in gets **403
`ACCOUNT_DISABLED`** with a real explanation rather than "invalid password" — but
only after their password checks out, so the endpoint tells an attacker nothing.

## Using it with a different frontend

A plain JSON REST API: bearer tokens, CORS from `CORS_ORIGINS`, Swagger at
`/api/docs` for any client to read. Two things to align when the client is not
the companion Next.js starter — set `CORS_ORIGINS` to its origin, and keep the
field rules in `common/constants/validation.ts` in step with whatever the client
validates, or the form accepts what the API rejects.

## Changing the contract without breaking callers

The envelope, the `errorCode` set and every route path are a **published
interface**. Treat a change to one the way you would a database migration:

- **Add, don't rename.** A new optional field is safe; renaming or removing one
  is not. Ship the new name alongside the old, migrate callers, then remove.
- **Never repurpose an `errorCode`.** Clients branch on it. A new meaning is a
  new code.
- **Never narrow a status.** Turning a 200 into a 400 for input that used to work
  breaks every caller that did not expect it.
- **A breaking change is a new version.** URI versioning is already on
  (`enableVersioning`), so `@Controller({ path: "orders", version: "2" })` serves
  `/api/v2/orders` beside the v1 route rather than in place of it.
- **Check the consumers first.** The companion frontend mirrors permission
  strings (`constants/app.ts`) and field limits (`constants/validation.ts`); a
  one-sided change there fails its CI, which is the point.
