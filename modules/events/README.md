# modules/events

## Purpose

In-process pub/sub with persistent log. Lets modules communicate without compile-time coupling. Every publish lands in `event_log` regardless of subscribers, so we can replay or upgrade transport later without API change.

## Public API

Import from `@/modules/events`.

- `events.publish(topic, payload) → void` _(awaits DB insert; in-process delivery is fire-and-forget)_
- `events.subscribe(topic, handler) → unsubscribe`

`topic` is a dotted string by convention: `'approvals.decided'`, `'employee.hired'`, `'payroll.run.completed'`.

## Slice-0 transport

In-process `EventEmitter`. Same Node process only. **This is fine for Slice 0 — Sentinel is a single-process Next.js app.** When we need cross-process delivery (background workers, multi-instance deploy), swap the transport to Postgres `LISTEN/NOTIFY` (or an external broker) — the public API stays the same.

## Delivery semantics

- **At-most-once** in-process: a subscriber that throws will be logged and skipped; the publish is not retried.
- **Persistent record:** every publish writes to `event_log` before in-process delivery fires. If we add a replayer later, it works off this table.
- **Order:** within a topic, on a single process, FIFO. Across topics or processes, no ordering guarantees.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** none.
- **Tables:** `event_log`.

## Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Subscriber doesn't fire | Subscribed in a different Node process | Slice-0 transport is in-process. Multi-process needs the transport upgrade. |
| `topic must be a non-empty string` | Passed `''` or non-string | Pass a real topic. |
| Subscriber error swallowed | We log + continue intentionally | A failing subscriber should not roll back the publisher's work. Check stderr. |
| `event_log` growing fast | Expected — every publish persists | Plan for partitioning + retention policy in a later slice. Not Slice 0's problem. |
