# Adding a module

A worked example: `orders`. Every file, in the order you create them. Copy the
shape, change the nouns.

```
src/modules/orders/
├── dto/create-order.dto.ts  update-order.dto.ts  query-orders.dto.ts
├── entities/order.entity.ts
├── orders.constants.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.service.spec.ts
└── orders.module.ts
```

## 1. Permissions

`src/common/constants/app.constants.ts` — add the strings, then give them to roles.

```ts
export const PERMISSION = {
  // …
  ORDERS_READ: "orders:read",
  ORDERS_CREATE: "orders:create",
  ORDERS_UPDATE: "orders:update",
} as const;
```

Admin gets everything automatically. Add the new ones to `MANAGER`/`USER` if they
should have them. Mirror the same strings in the frontend's `constants/app.ts`.

## 2. Entity

```ts
// entities/order.entity.ts
import { Column, Entity, Index, ManyToOne } from "typeorm";
import { BaseEntity } from "@/database/base.entity";
import { User } from "@/modules/users/entities/user.entity";

@Entity("orders")
export class Order extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 40 })
  reference: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount: string; // numeric comes back as string — never float for money

  @Column({ type: "uuid" })
  customerId: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  customer: User;
}
```

`BaseEntity` already gives you `id`, `createdAt`, `updatedAt`, `deletedAt`.

## 3. Migration

```bash
pnpm migration:generate src/database/migrations/add-orders
pnpm migration:run
```

**Read the generated SQL before committing it.** TypeORM diffs entities against
the live database — it will happily write a `DROP COLUMN`. The command also
formats and lints the file, and rewrites `uuid_generate_v4()` to
`gen_random_uuid()` so no `uuid-ossp` extension is needed. Never `synchronize`.

## 4. Constants the module owns

```ts
// orders.constants.ts
export const ORDERS = {
  /** `?sort=` allow-list; the first entry is the default order. */
  SORTABLE_COLUMNS: ["createdAt", "reference", "amount"],
  /** Columns `?search=` matches, OR-ed. */
  SEARCHABLE_COLUMNS: ["reference"],
  /** Query params that become an exact match; the query DTO validates them. */
  FILTERABLE_COLUMNS: ["customerId", "status"],
  /** Columns that accept `?<column>From=` / `?<column>To=`. */
  DATE_RANGE_COLUMNS: ["createdAt"],
  CACHE_TTL_SECONDS: 60,
} as const;
```

Anything static — a TTL, a limit, a column list — lands here, not inline. These
four lists are the whole list-query surface of the module; the service just
points at them. See [API.md](API.md#list-queries) for what each one exposes.

## 5. DTOs

```ts
// dto/create-order.dto.ts
import { IsNumberString, IsString, IsUUID, Length } from "class-validator";

export class CreateOrderDto {
  @IsString()
  @Length(3, 40)
  reference: string;

  @IsNumberString()
  amount: string;

  @IsUUID()
  customerId: string;
}
```

```ts
// dto/update-order.dto.ts — never re-type the fields
import { PartialType } from "@nestjs/swagger";
import { CreateOrderDto } from "@/modules/orders/dto/create-order.dto";

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
```

```ts
// dto/query-orders.dto.ts — page/limit/sort/search come from the base
import { IsOptional, IsUUID } from "class-validator";
import { BooleanQuery, DateQuery } from "@/common/decorators";
import { PaginationQueryDto } from "@/common/dto/pagination-query.dto";

export class QueryOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  // A query string carries strings, never a boolean or a date — the coercion is
  // declared once in `common/decorators`, not re-invented per DTO.
  @BooleanQuery()
  isPaid?: boolean;

  /** `<column>From` / `<column>To` is the convention `dateRangeColumns` reads. */
  @DateQuery()
  createdAtFrom?: string;

  @DateQuery()
  createdAtTo?: string;
}
```

A field with rules that repeat across modules has a decorator of its own —
`@EmailField()`, `@PasswordField()`. Add to `common/decorators/validation.ts`
the moment a second DTO needs the same rule, so tightening it is one edit.

A privileged field (status transition, price override) gets its **own DTO,
endpoint and permission** — never a flag inside the generic update.

## 6. Service

Business rules live here. It never sees `req`/`res`.

Extend **`BaseCrudService`** and declare only what differs. List (paged, sorted,
searched, filtered), read, soft-delete and restore come with it.

```ts
// orders.service.ts
@Injectable()
export class OrdersService extends BaseCrudService<Order> {
  protected readonly resourceName = "Order";
  // The allow-lists are the whole query string. `?sort=`, `?search=`,
  // `?customerId=`, `?status=`, `?createdAtFrom=`, `?page=`, `?limit=`,
  // `?includeDeleted=` — no code, and `findAll` is not overridden at all.
  // Each list is checked against the entity's own columns: a typo or a renamed
  // field fails the build here instead of silently ignoring a filter.
  protected readonly sortableColumns = ORDERS.SORTABLE_COLUMNS;
  protected readonly searchableColumns = ORDERS.SEARCHABLE_COLUMNS;
  protected readonly filterableColumns = ORDERS.FILTERABLE_COLUMNS;
  protected readonly dateRangeColumns = ORDERS.DATE_RANGE_COLUMNS;

  constructor(@InjectRepository(Order) protected readonly repo: Repository<Order>) {
    super();
  }

  // `saveNew`/`applyUpdate` are protected on purpose: the write path stays
  // visible per module, and a controller cannot skip a required step — hashing
  // a password, say — by reaching for a generic `create`.
  create(dto: CreateOrderDto): Promise<Order> {
    return this.saveNew(dto);
  }

  update(id: string, dto: UpdateOrderDto): Promise<Order> {
    return this.applyUpdate(id, dto);
  }
}
```

That gives you `findAll`, `findOne(id, includeDeleted?)`, `remove` (soft),
`restore`, and a `<Resource> not found` 404 on every path — plus the whole list
query string against your allow-lists.

They are allow-lists because the key reaches the query builder, so a caller must
not get to choose it; validating the _value_ stays the DTO's job. A filter a
query string cannot express — the current tenant, "mine only" — goes through
`super.findAll(query, extraFilters)`, which is the only reason to override it.

**Rules are overrides.** Anything the resource decides for itself is an override
that calls `super`, or its own method. `UsersService` does both — it overrides
`remove` to refuse self-deletion, and implements the `onChanged` hook the base
calls after every write:

```ts
protected onChanged(id: string): Promise<void> {
  return this.cache.del(ordersCacheKey(id));
}
```

**`createdBy` / `updatedBy` need no code.** `AuditSubscriber` stamps them from
the request context on every insert and update. Writes with no HTTP request
behind them — the seed, a migration, a cron — leave them null, which is the
honest answer. The same context answers "who is acting" for a rule that needs it:

```ts
import { currentUserId } from "@/common/context/request-context";
```

Need another module's data? Inject its **exported service** (`UsersService`),
never its repository or entity.

Caching is opt-in: inject `CacheService` and use
`wrap(key, ttl, fn)`, then `del(key)` in every method that writes. Cache
projections, not entities — values round-trip through JSON.

**Writing to two tables in one operation? Use a transaction.** Nothing in the
template does yet, because the example module writes one row — but the moment
yours does not, this is the shape:

```ts
constructor(private readonly dataSource: DataSource) {}

placeOrder(dto: CreateOrderDto): Promise<Order> {
  return this.dataSource.transaction(async (manager) => {
    const order = await manager.save(manager.create(Order, dto));
    await manager.decrement(Stock, { sku: dto.sku }, "quantity", dto.count);
    return order; // any throw in here rolls back both writes
  });
}
```

Two rules that stop transactions becoming a source of outages: keep them
**short** — never await an HTTP call or a cache write inside one — and do the
cache invalidation **after** the transaction commits, not inside it.

## 7. Controller

HTTP only: route, permission, DTO, delegate.

```ts
// orders.controller.ts
@ApiTags("Orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSION.ORDERS_READ)
  findAll(@Query() query: QueryOrdersDto): Promise<Paginated<Order>> {
    return this.orders.findAll(query);
  }

  @Post()
  @RequirePermissions(PERMISSION.ORDERS_CREATE)
  @ResponseMessage("Order created")
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.orders.create(dto);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSION.ORDERS_UPDATE)
  @ResponseMessage("Order updated")
  // `@IdParam()` is `@Param("id", ParseUUIDPipe)` — without the pipe a malformed
  // uuid reaches Postgres and comes back a 500 instead of the 400 it is.
  update(@IdParam() id: string, @Body() dto: UpdateOrderDto): Promise<Order> {
    return this.orders.update(id, dto);
  }
}
```

Write the endpoint in the same change as the DTO — `knip` fails the build on a
file nothing imports, which is the point.

No envelope, no try/catch, no status codes — the interceptor and the filter do
that. Throw `NotFoundException` / `BadRequestException` and stop.

## 8. Module + registration

```ts
// orders.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService], // only if another module calls it
})
export class OrdersModule {}
```

Add `OrdersModule` to `imports` in `src/app.module.ts`. Done — the route is
live at `/api/v1/orders`, protected, validated, documented in Swagger.

## 9. Test what would hurt

```ts
// orders.service.spec.ts
it("only sorts by allow-listed columns", () => {
  expect(buildOrder("amount:asc", ORDERS.SORTABLE_COLUMNS, "createdAt")).toEqual({
    amount: "ASC",
  });
});
```

Branches, money, dates, permissions. Not getters.

## 10. Ship

```bash
pnpm verify          # must pass
git commit -m "feat(orders): add order module"
```

## Checklist

- [ ] Permission strings added both sides
- [ ] Entity extends `BaseEntity`, migration generated **and read**
- [ ] Query DTO extends `PaginationQueryDto`
- [ ] Service extends `BaseCrudService`; only the filters and rules are yours
- [ ] Controller carries `@RequirePermissions`, no business logic
- [ ] A `DELETE` leaves the row restorable, and `restore` is exposed if anyone
      needs it — check what a soft delete frees, e.g. a unique email
- [ ] Module registered in `app.module.ts`
- [ ] No literal left inline — it is in `orders.constants.ts`
- [ ] `pnpm verify` green

## When the module needs to scale

Cheapest fix first. Do not skip ahead — most "we need microservices" is a
missing index.

1. **Index the columns you filter and sort on.** Add them to the entity
   (`@Index`) and generate a migration. Check with `EXPLAIN ANALYZE`.
2. **Stop over-fetching.** `select` only the columns you return; never load a
   relation you do not render.
3. **Cache the hot read** — `CacheService.wrap(key, ttl, fn)`, invalidated by
   the module that writes. See `UsersService.findProfile`.
4. **Move slow work off the request** — email, exports, webhooks. Add
   `@nestjs/bullmq` and a processor; the controller returns 202.
5. **Scale out.** The app is stateless: run N replicas behind a load balancer.
   Rate limits and cache already live in Redis, so they hold across replicas.
   Watch `replicas x DATABASE_POOL_SIZE` against `max_connections`.
6. **Read replica** for reporting-heavy modules: a second `DataSource` pointed
   at the replica, injected only where stale reads are acceptable.
7. **Extract the module into its own service** — last, and only for a separate
   scaling profile, release cadence or team. Because the module already talks
   through its exported service and owns its tables, this is a move plus a
   client. Steps are in
   [ARCHITECTURE.md](ARCHITECTURE.md#monolith--modular-monolith--microservices).

Rule of thumb: measure before 1, and again after each step. Every rung above 5
costs operational complexity that never goes away.
