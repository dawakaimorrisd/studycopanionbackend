# Runbook — Study Companion Backend

Day-to-day operation of the console + API, covering both `DB_PROVIDER` targets. Read `BACKEND_BUILD_PLAN.md` for architecture/roles and `docs/phases/` for what each phase built; this doc is just "how do I actually run this thing."

## The two database targets, and when to use which

| | Local / this Codespace | Production launch |
|---|---|---|
| Provider | SQLite | Postgres (Neon) |
| Command prefix | `npm run db:local:*` | `npm run db:production:*` |
| `.env` `DB_PROVIDER` | `sqlite` | `postgresql` |
| `.env` `DATABASE_URL` | `file:./dev.db` | your Neon connection string |

**Switching targets:** edit `.env`, then re-run the matching `db:*:generate`/`db:*:migrate` command — this rewrites `prisma/schema.prisma`'s `provider` line via `scripts/set-db-provider.mjs` before Prisma runs. Never hand-edit that line directly, and never leave `.env`'s `DB_PROVIDER` out of sync with which command you last ran — Prisma will happily connect to whichever `DATABASE_URL` you gave it using whichever provider the schema was last generated for, and a mismatch there fails confusingly rather than obviously.

## First-time setup

```bash
npm install
cp .env.example .env
# edit .env — at minimum, set SEED_ADMIN_PASSWORD to something real,
# and FRONTEND_ORIGIN once the separate Frontend app exists

npm run db:local:migrate     # creates tables in dev.db
npm run seed                  # creates the one required Admin account
npm run dev
```

Visit `/console/login`, sign in as the seeded Admin. **Then create and
activate a Semester** (`/console/semesters`) before doing anything else —
as of Phase 10, course enrollment, payment, content publishing, and nearly
every student/instructor API endpoint resolve "the active semester"
server-side and return a `500` if none exists. This is the one manual step
`npm run seed` doesn't do for you.

**Want something to actually look at?** `npm run seed:demo` populates a
full demo dataset — a college, course, staff accounts, and four students
deliberately placed in each engagement bucket (see `prisma/seedDemo.ts` for
the exact setup) so the Phase 7 dashboard has real data on first login
instead of empty tables. **This script predates Phase 10 and has not been
updated for it** — it still writes to `NoteAccess`/`AssignmentAccess`
(removed models) and doesn't set the now-required `semesterId` on
`Note`/`Assignment`/`InstructorCourse`/`StudentCourse`. It will very likely
fail outright until someone updates it for the current schema. Flagged
here, not silently left for you to discover via a stack trace.

## Semester activation — the highest-blast-radius action in this app

`/console/semesters` → Activate does three things atomically, in one
transaction (`lib/server/access/semester.ts`'s `activateSemester`):
1. Deactivates whatever semester was previously active (there is never a
   moment with two active, or zero, once the first one exists).
2. Rolls every currently-enrolled student's course structure
   (`StudentSemester`/`StudentCourse`) forward into the new semester as an
   editable starting point.
3. Creates a fresh, **unpaid** `StudentSemesterAccess` row for each of
   them — payment never carries forward, by design, no exceptions.

**Instructor course assignments do NOT roll forward** — Admin/Moderator
reassigns instructors to courses fresh each semester from
`/console/staff/:id`. This is deliberate, not a gap — see
`PHASE_10_PLUS_BUILD_PLAN.md`'s Phase 17 note.

This is idempotent (safe to re-run if interrupted) but **irreversible in
practice** — there's no "undo activation" button. The console shows a real
student/course-enrollment count in the confirmation dialog before this
fires; read it before confirming, especially in production.

## Environment variables reference

See `.env.example` for the full list with inline comments. The ones that matter operationally:

- `DATABASE_URL` / `DB_PROVIDER` — see table above
- `GROQ_API_KEY` (and optionally `GROQ_API_KEY_2` through `_5`) — leave blank until you have them; Generate fails cleanly to `generationError` either way, nothing crashes
- `FRONTEND_ORIGIN` — comma-separated list of origins allowed to call `/api/v1/**`. **Must be set correctly before pointing a real Frontend app at this** — CORS silently blocks anything not listed here, which looks like a network error on the Frontend side, not an auth error.
- `SESSION_TTL_DAYS` — how long both staff and student sessions last before needing to log in again
- `STORAGE_PROVIDER` / `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — where uploaded files (and rendered Assignment PDFs) go; see "File storage" below. **This one has real production consequences if left at its default — read that section, don't skip it.**
- `ENGAGEMENT_ENGAGED_DAYS` / `ENGAGEMENT_AT_RISK_AFTER_DAYS` — the analytics thresholds (build plan §9). Tune here, no redeploy needed.
- `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` — only read by `npm run seed`

## File storage

**CORRECTED — this section previously described a `UPLOADS_DIR` env var and a `backup:uploads` script that don't exist in the actual code.** The real mechanism (`src/lib/server/storage.ts`) is provider-based, controlled by `STORAGE_PROVIDER`:

- **Default (unset, or anything other than `"cloudinary"`)** — local disk, hardcoded to `static/uploads/studycompanion/` (not configurable via env var), served back out at `/uploads/studycompanion/...`. Fine for `npm run dev` — one long-lived process, one real filesystem.
- **`STORAGE_PROVIDER=cloudinary`** (needs `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`) — uploads go to Cloudinary as `resource_type: 'raw'` assets.

**Read this before deploying anywhere beyond a single dev process:** local disk storage does not reliably survive being written by one server instance and later read by another — a real concern on any serverless/edge host (this project's `netlify.toml` suggests Netlify Functions, where different requests can hit different, short-lived instances with independent, ephemeral filesystems). A file saved during upload may 404 on a later read for no reason visible in the code itself — this is very likely what actually happened in a real reported incident (an Instructor getting a 404 opening a student's submitted file). **Set `STORAGE_PROVIDER=cloudinary` for any deployment where this matters, which is effectively every deployment except local dev.** There is no backup script for local storage (an earlier version of this doc referenced one, `npm run backup:uploads` — it doesn't exist); Cloudinary makes that concern moot for anything other than local dev anyway.

## Logs

Everything logs as one JSON line per event via `src/lib/server/logger.ts` — `{ time, level, message, ...context }`. Key events to grep for:

- `staff_login_succeeded` / `staff_login_failed` — console logins
- `student_login_succeeded` / `student_login_failed`, `student_signup_succeeded`
- `instructor_login_succeeded` / `instructor_login_failed`
- `generation_started` / `generation_provider_failed` / `generation_succeeded` / `generation_failed`
- `rate_limited` — someone hit a rate limit (see below)
- `api_unhandled_exception` / `unhandled_error` — something threw that shouldn't have; both include an `errorId` that's also shown to the user, so a bug report can be matched to the exact log line

## Rate limiting

In-memory, per-process (`src/lib/server/rateLimit.ts`) — fine for this single-process deployment, resets on restart. Current limits:

| Endpoint | Limit |
|---|---|
| Console login | 10 attempts / 15 min / IP |
| Student login | 10 attempts / 15 min / IP |
| Instructor login | 10 attempts / 15 min / IP |
| Student signup | 5 / hour / IP |

If this ever runs across multiple processes/instances, the in-memory `Map` needs to become a shared store (Redis, etc.) — call sites don't need to change, only `rateLimit()`'s internals.

## Restarting / redeploying

This is a normal long-running Node process (`npm run dev` locally, or `npm run build && npm run preview`/an adapter-appropriate start command for anything closer to production). Restarting it:
- Clears in-memory rate limit state (fine — it's meant to reset)
- Does **not** affect sessions (`Session`/`StudentSession` are in the DB) or uploaded files (on disk) or anything else — nothing in this app keeps meaningful state only in memory except rate limiting

## Common issues

**"Missing required env var: GROQ_API_KEY" when clicking Generate** — expected until a real key is set; the error lands in `generationError` on the Note/Assignment and Generate can just be clicked again once `.env` has at least `GROQ_API_KEY` set.

**CORS errors from the Frontend app** — check `FRONTEND_ORIGIN` in `.env` matches the Frontend's actual origin exactly (scheme + host + port), and that the server was restarted after changing it (env vars are read at process start).

**A Prisma error mentioning the wrong database type** — `DB_PROVIDER` in `.env` and the provider the schema was last generated for (via `db:local:*` vs `db:production:*`) are out of sync. Re-run the matching `db:*:generate` command.

**A `500` saying no active semester is configured** — expected on a fresh install or right after a migration, before anyone has visited `/console/semesters` and clicked Activate. Every semester-scoped read (which is nearly everything as of Phase 10) throws this deliberately rather than silently picking an arbitrary semester or returning empty data that looks like "no content exists yet." Fix: log in as Admin/Moderator, create a Semester, activate it.

**A student/instructor can log in but every content endpoint returns empty or `no_access`** — check, in order: (1) is a Semester active at all (see above), (2) is the student enrolled in the relevant course for that semester (`/console/students/:id`), (3) is their `StudentSemesterAccess`/`InstructorSemesterAccess` for that semester marked paid (same page, or `/console/staff/:id` for an Instructor). All three are required — enrolled-but-unpaid and paid-but-not-enrolled both correctly show nothing.