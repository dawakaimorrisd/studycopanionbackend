# Phase 8 — Hardening & Handoff

## What this phase built

**Rate limiting** (`src/lib/server/rateLimit.ts`) — an in-memory, per-process fixed-window limiter. Applied to every auth entry point:

| Endpoint | Limit |
|---|---|
| `/console/login` | 10 attempts / 15 min / IP |
| `POST /api/v1/students/login` | 10 attempts / 15 min / IP |
| `POST /api/v1/instructors/login` | 10 attempts / 15 min / IP |
| `POST /api/v1/students/signup` | 5 / hour / IP |

In-memory is a deliberate scope decision, not an oversight — this is a single-process deployment (see build plan §6), so a shared store like Redis would be solving a problem this deployment doesn't have. If it ever runs across multiple processes, only `rateLimit()`'s internals need to change, not any call site.

**Structured logging** (`src/lib/server/logger.ts`) — one JSON line per event (`{ time, level, message, ...context }`) instead of free-form `console.log`. Instrumented at every point that matters operationally: login success/failure (console, student, instructor), signup, generation start/provider-failure/success/failure, rate-limit trips, and unhandled exceptions.

**Consistent API error handling** (`src/hooks.server.ts`) — every `/api/v1/**` route was already returning `{ error: { code, message } }` on *expected* failures (Phase 6). This phase adds the backstop: the whole `resolve(event)` call for `/api/**` is now wrapped in try/catch, so an *unexpected* exception (a bug, a Prisma error that wasn't anticipated) also comes back as that same JSON shape with a 500 and an `errorId`, instead of SvelteKit's default HTML error page — which would be a genuinely confusing response for a `fetch()` caller to receive. A `handleError` hook logs anything that reaches SvelteKit's own error handling (console pages, or something that somehow escaped the `/api/**` catch) with the same kind of `errorId`, so a bug report can be matched to the exact log line.

**CORS review** — confirmed the existing Phase 6 implementation is correct: locked to `FRONTEND_ORIGIN`, not a wildcard; `Access-Control-Allow-Credentials: false` (correct, since this uses bearer tokens, not cookies, for cross-origin requests); preflight (`OPTIONS`) handled explicitly. No changes needed, documented as reviewed in the runbook.

**Demo seed script** (`prisma/seedDemo.ts`, `npm run seed:demo`) — separate from the required-Admin-only `prisma/seed.ts`. Creates a full demo dataset: a college, course, Moderator + Instructor accounts, a Note with hand-seeded question units, and **four students deliberately placed in each engagement outcome** (engaged, moderate, at-risk-by-recency, at-risk-by-never-opened) — so Phase 7's dashboard has real, correctly-classified data to look at immediately rather than starting from an empty state. Idempotent — safe to re-run.

**Cloudinary file storage** — uploaded PDFs/DOCX files are stored remotely in Cloudinary rather than on the Codespace filesystem. This removes the previous dependency on `data/uploads/` and the local upload backup script.

> **⚠️ CORRECTED, post-Phase-17:** local disk storage was reintroduced as the default (`lib/server/storage.ts`'s `LocalFileStorage`, `STORAGE_PROVIDER` unset or anything other than `"cloudinary"`) specifically so local development doesn't require Cloudinary credentials — files go to `static/uploads/studycompanion/` again, same path convention as before this phase. Cloudinary is opt-in via `STORAGE_PROVIDER=cloudinary` and is **required, not optional, for any real multi-instance/serverless deployment** — local disk storage is unsafe there (a file saved by one server instance may not exist for another instance's later read of it). This is very likely what actually caused a 404 an Instructor hit trying to open a student's submitted file post-Phase-17 — see `lib/server/storage.ts`'s `LocalFileStorage` comment for the full explanation. `npm run backup:uploads`, mentioned below, does not currently exist as a script — flagged as a real gap, not silently left for someone to discover by running it.

**Runbook** (`docs/RUNBOOK.md`) — the actual "how do I run this day to day" doc: first-time setup, the `DB_PROVIDER` switch procedure, every env var's operational meaning, what to grep logs for, the rate limit table, restart behavior, and a short troubleshooting section for the mistakes most likely to actually happen (missing API keys, CORS misconfiguration, `DB_PROVIDER`/schema drift).

## What's deliberately not in this phase

No external monitoring/alerting integration, no log shipping to a third-party service, no automated backup scheduling (the script exists; wiring it to cron/a GitHub Action is a "when this stops being a one-college pilot" concern, not a day-one one). All flagged as such in the runbook rather than silently absent.

## Testing this phase

1. `npm run seed:demo`, then visit `/console/progress/<the demo course id>` — confirm all four demo students show the engagement badge described in the script's console output
2. Hit `/console/login` (or any of the API login endpoints) 11 times quickly with a wrong password — confirm the 11th attempt returns the rate-limit message instead of "incorrect password"
3. Temporarily throw an error inside any API route handler (or trigger a genuine Prisma error, e.g. a malformed query) — confirm the response is still `{ error: { code: 'internal_error', message: '...(ref: <uuid>)' } }`, not an HTML page, and that the same uuid appears in the server log via `logger.error`
4. Run `npm run backup:uploads` after uploading a file through the console — confirm a tarball appears under `backups/` containing it

## Exit criteria

- [ ] All four auth entry points reject a rapid burst of attempts with a clear, rate-limited response
- [ ] An unexpected server error on any `/api/v1/**` route returns valid JSON in the standard error shape, never an HTML error page
- [ ] `npm run seed:demo` produces a dashboard that visibly shows one student in each of the three engagement states
- [x] Uploaded files are stored and retrieved successfully through Cloudinary-backed `FileStorage`.
- [ ] `docs/RUNBOOK.md` alone is enough to get a new operator from a fresh clone to a running, logged-into console
