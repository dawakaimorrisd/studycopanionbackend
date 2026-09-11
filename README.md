# Study Companion — Backend

AI-assisted study platform backend for Notes and Assignments — SvelteKit console + a versioned REST API for a separate Frontend project. Built across 18 phases (0–17); see `BACKEND_BUILD_PLAN.md` for the architecture and role rules, `PHASE_10_PLUS_BUILD_PLAN.md` for Phases 10–17's Semester/monetization/chapters/submission-distribution rebuild in detail, and `docs/phases/` for what each of Phases 0–9 actually built.

**Start here:**
- New to this codebase? Read `README_HANDOFF.md` for the quick-start and current build status.
- Need the architecture, roles, or design decisions? Read `BACKEND_BUILD_PLAN.md` (Phases 0–9) and `PHASE_10_PLUS_BUILD_PLAN.md` (Phases 10–17).
- Building the Frontend against the current API? Read `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` — supersedes the Phase 9 handoff wherever they conflict.
- Operating this day to day (env vars, logs, rate limits)? Read `docs/RUNBOOK.md`.

## Stack

SvelteKit + TypeScript, Prisma (SQLite for local dev inside a Codespace, Postgres/Neon for production — see `BACKEND_BUILD_PLAN.md` §5), file storage (local disk by default for dev, Cloudinary opt-in for production — see `lib/server/storage.ts` and `BACKEND_BUILD_PLAN.md` §5b, **required** for any real deployment), Groq (multi-key, up to 5) for AI generation, Zod for validation.

## Quick start

```bash
npm install
cp .env.example .env          # set SEED_ADMIN_PASSWORD; leave GROQ_API_KEY blank for now
npm run db:local:migrate
npm run seed                  # creates one Admin account
npm run seed:demo             # optional — full demo dataset for /console/progress
npm run dev
```

Visit `/console/login` and sign in as Admin. **First thing to do in a fresh environment: create and activate a Semester** (`/console/semesters`) — almost nothing else works until one is active (see `PHASE_10_PLUS_BUILD_PLAN.md`'s Phase 10). Full walkthrough in `README_HANDOFF.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run preview` | Production build / preview it locally |
| `npm run check` | Type-check via `svelte-check` |
| `npm run db:local:generate` / `db:local:migrate` / `db:local:studio` | Prisma against SQLite (day-to-day dev) |
| `npm run db:production:generate` / `db:production:migrate` | Prisma against Postgres/Neon (production target) |
| `npm run seed` | Seed one Admin account |
| `npm run seed:demo` | Seed a full demo dataset (students in each engagement bucket, a demo Note with a completed chapter-test round) |

Never hand-edit the `provider` line in `prisma/schema.prisma` — the `db:local:*`/`db:production:*` scripts rewrite it via `scripts/set-db-provider.mjs` so both targets stay generated from the same schema file. See `BACKEND_BUILD_PLAN.md` §5.

## Project layout

```
src/routes/console/**    server-rendered, cookie-authed — Admin/Moderator only, direct Prisma access
src/routes/api/v1/**     bearer-token-authed JSON API — the only thing the separate Frontend project talks to
src/lib/server/**        shared business logic (auth, generation, analytics, etc.) used by both trees above
src/lib/server/access/** Phase 10+ authorization layer — canAccessSemester/canAccessCourse/canManageCourse.
                          Every content/enrollment/submission route calls into these; never an inline check.
prisma/schema.prisma     single source of truth for both DB providers
docs/phases/**           one doc per Phase 0–9 build — what got built, why, how to test it.
                          Phases 10–17 are documented as one consolidated doc instead — see
                          PHASE_10_PLUS_BUILD_PLAN.md and docs/phases/README.md.
```

## Known limitation

Everything here was built in a sandbox that couldn't reach `binaries.prisma.sh`, so `prisma generate`/`migrate` has never actually been run against this code — see `README_HANDOFF.md`'s "Known environment limitation" section before assuming anything beyond type-checking has been verified, especially Phase 9 and everything in Phases 10–17.