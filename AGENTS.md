# AGENTS.md

The rules for this repo live in **[CLAUDE.md](CLAUDE.md)** — read it first,
whichever assistant you are.

Then: [ARCHITECTURE.md](docs/ARCHITECTURE.md) for why, and
[ADD-A-MODULE.md](docs/ADD-A-MODULE.md) for the step-by-step recipe.
[API.md](docs/API.md) and [OPERATIONS.md](docs/OPERATIONS.md) hold the contract
and the runtime behaviour.

Nothing is done until `pnpm verify` passes.

## Driving one well

Prompts that work, because they name the rule file rather than the symptom:

> **New module** — Read CLAUDE.md and ADD-A-MODULE.md, then add an `invoices`
> module: number (unique), amount, status (draft/sent/paid), customerId → users.
> Follow the recipe exactly — permissions, generated migration, constants file,
> no inline literals. Finish with `pnpm verify` green.
>
> **A field on what exists** — Add `phone` to users: entity + migration, DTOs,
> and the limits in `common/constants/validation.ts`. The mirror spec must still
> pass.
>
> **Review before merging** — Review the diff against CLAUDE.md. Flag inline
> literals, hardcoded permissions, business logic in a controller, a cross-module
> import that reaches past an exported service, anything duplicating an existing
> helper.
>
> **When CI is red** — `pnpm verify` fails, here is the output. Fix the cause,
> not the rule. Never weaken a lint rule or add a knip ignore to make it pass.

Done means `pnpm verify` green **and** an honest list of what was skipped — ask
for it explicitly ("then tell me what you left out and why").

- **Point at the rule, not the symptom** ("CLAUDE.md → No magic values" beats
  "don't hardcode that"), and keep it to **one module per session** — agents
  drift when asked for four at once. Correcting the same thing twice means a
  missing line in `CLAUDE.md`; write it there.
- **Make it run.** A green build is not a working API. That is how the real bugs
  in this template were found (a leaked password hash, a boot warning, broken
  migration scripts).
- **Read these yourself:** auth and permission changes, migrations touching
  existing data, anything handling money, dependency upgrades. The global guards,
  migrations and `pnpm audit` narrow the blast radius; they do not replace
  reading the diff.
