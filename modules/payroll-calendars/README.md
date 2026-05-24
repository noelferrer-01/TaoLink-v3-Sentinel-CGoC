# modules/payroll-calendars

## Purpose
Models per-client cut-off and payday rules. Drives the countdown badges on DTR + Pay Runs and the resolved-dates frozen onto each pay run at creation.

## Public API
- `create(input)` — insert a calendar. `clientId` may be null (treated as global default). Audit-logged.
- `update(id, patch, opts?)` — mutate. Throws on missing id. Audit-logged.
- `getForClient(clientId)` — returns the client's calendar, OR the global default (if exists), OR null.
- `resolveForPeriod(clientId, periodStart, periodEnd)` — computes cut-off and payday dates for the given worked period. Returns `{ dtrCutoffDate, paydayDate, source }` where `source` is `'client' | 'global-default' | 'fallback-defaults'`.

## Dependencies
- `modules/clients` — `client_id` FK defined in SQL migration `0014_slice2_payroll_calendars.sql`; the Drizzle schema references `clients.id` via `.references()`
- `@/core/db` — Postgres connection
- `modules/audit` — called at the service layer inside `create` and `update` (matches project convention; see `modules/hr/service.ts` and `modules/clients/service.ts`)

## Known failure modes
- **Schema-level FK not reflected in `modules/clients/schema.ts`:** the `clients.default_payroll_calendar_id` FK to `payroll_calendars(id)` is established in migration `0014_slice2_payroll_calendars.sql` only, not in the Drizzle clients schema (intentional forward-reference workaround). Drizzle-kit introspection won't show it; the live DB does.
- **Circular FK in cleanup (test `beforeEach`):** `payroll_calendars.client_id` → `clients.id` AND `clients.default_payroll_calendar_id` → `payroll_calendars.id`. Delete `payroll_calendars` before `clients` in any test cleanup. If `default_payroll_calendar_id` is ever set in a test, NULL it out first before deleting.
- **Calendar changes are not retroactive.** Past pay runs capture resolved cut-off and payday at creation time. Changing a calendar later does not re-stamp prior runs.
- **`db.ts` must include payrollCalendarsSchema in the schema spread.** If the schema is missing, Drizzle ORM queries against `payroll_calendars` will silently fall back to raw table access and lose type-safety. Added in Phase 2 alongside this module.

## Notes
- "Days after period end" is a deliberately simple rule shape for Slice 2. If a real client needs "5th of next month" or "next business day," extend `resolveForPeriod` and the schema then.
- The fallback defaults (2 days cut-off, 5 days payday) only fire when no calendar exists for the client *and* no global default is set. In normal Sentinel deployments, at least the global default should exist.
- Audit convention: service-layer (same as `modules/hr` and `modules/clients`). Actor defaults to `null` (system) when no `actorUserId` is passed.
