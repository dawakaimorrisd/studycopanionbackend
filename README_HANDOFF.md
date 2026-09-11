# Study Companion — Backend (Phases 0–17, all built)

Per-phase details for Phases 0–8 are in `docs/phases/PHASE_0.md` through
`PHASE_8.md`; Phase 9 in `docs/phases/PHASE_9.md`. **Phases 10–17 are
documented as one consolidated doc, `PHASE_10_PLUS_BUILD_PLAN.md`**, not
split into eight more phase files — see `docs/phases/README.md` for why.
For day-to-day operation (env vars, logs, rate limits, troubleshooting), see
`docs/RUNBOOK.md`. This file is just the quick-start.

## Corrected: SQLite vs Neon

SQLite runs **day to day inside this Codespace** (dev/build). Postgres via
**Neon is the production launch target**, wired up whenever you're ready by
just changing `.env`:

```bash
# Day to day in the Codespace (default, already in .env.example):
DATABASE_URL="file:./dev.db"
DB_PROVIDER="sqlite"

# When ready to test/launch against production:
DATABASE_URL="postgresql://user:pass@ep-xxxx.neon.tech/studycompanion?sslmode=require"
DB_PROVIDER="postgresql"
```

Matching npm scripts: `db:local:*` (sqlite) and `db:production:*` (postgresql).

## Getting it running

```bash
npm install
cp .env.example .env    # set SEED_ADMIN_PASSWORD; leave GROQ_API_KEY blank for now
npm run db:local:migrate
npm run seed
npm run seed:demo    # optional — populates a full demo dataset, including
                      # students pre-placed in each engagement bucket, so
                      # /console/progress has something real to show
npm run dev
```

Visit `/console/login`, sign in as Admin. **First: create and activate a
Semester** (`/console/semesters`) — as of Phase 10, almost nothing else
works until one is active (course enrollment, payment, content publishing,
and every student/instructor-facing API endpoint all resolve "the active
semester" server-side and fail loudly if there isn't one). Then: create a
College, a Course, staff accounts, enroll a student in the active semester
and a course (`/console/students/:id`), activate their semester access
(same page), upload a Note/Assignment (paste or file), Generate (will fail
gracefully until you add a real API key — see below), and Save for Students
(the Phase 12 replacement for the old "Send" flow — no recipient picker;
every paid, enrolled student sees it automatically).

## AI key(s)

Left blank in `.env.example` on purpose — add at least `GROQ_API_KEY`
whenever you have it:

```
GROQ_API_KEY="..."
```

Until then, clicking "Generate" fails gracefully (`generationError` gets set
to a clear "Missing required env var" message) rather than crashing anything.

**Multiple Groq keys:** up to 4 more are supported — `GROQ_API_KEY_2`
through `GROQ_API_KEY_5`, all optional. Set any of them and a key-picker
dropdown automatically appears next to the console's Generate button,
letting staff force a specific key for that click instead of the default
(first-configured key). Leave them blank and nothing changes from
single-key behavior. **Gemini was removed entirely** — Groq is the sole
generation provider now, not a fallback for anything else; see
`docs/phases/PHASE_9.md`'s amendment for why.

## What's done

- **Phase 0** — scaffolding, dual-provider DB setup
- **Phase 1** — auth (console cookie + API bearer, shared Session mechanism)
- **Phase 2** — College/Course/Staff console management
- **Phase 3** — Note/Assignment upload (paste or PDF/DOCX)
- **Phase 4** — synchronous AI generation (originally Gemini-primary/Groq-fallback; Gemini later removed, Groq-only with up to 5 selectable keys — see the v9 amendment below and validate-and-retry-once)
- **Phase 5** — send/revoke access grants, open-signal API endpoint
- **Phase 6** — full `/api/v1/**` REST surface: Student signup/login/content/study-sessions, Instructor login/courses/content/upload/"my students"
- **Phase 7** — real analytics: shared engaged/moderate/at-risk classifier (`lib/server/analytics/engagement.ts`), per-course/per-student progress dashboard in the console, and the Instructor API's "my students" endpoint now uses the same shared logic
- **Phase 8** — rate limiting on all four auth endpoints, structured JSON logging, a global API error backstop (unexpected exceptions return proper `{ error: {...} }` JSON, never an HTML page), a demo seed script (`npm run seed:demo`), and `docs/RUNBOOK.md`. (This entry originally also listed an uploads backup script, `npm run backup:uploads` — that script does not actually exist in `package.json`; removed from this summary rather than left to mislead. See `BACKEND_BUILD_PLAN.md` §6a for the current storage story.)
- **Phase 9** — `QuestionUnit` pivoted to multiple choice; Note-based chapter tests (instructor start/reveal, one attempt per student, batch-gated results — see `docs/phases/PHASE_9.md`); Assignment-based self-paced drills (student-controlled, repeatable, no staff involvement); `DictionaryEntry.example`.
- **Phase 10** — `Semester` becomes the top-level academic container (exactly one active at a time); real student course enrollment (`StudentSemester`/`StudentCourse`, admin/moderator-assigned, replacing "everyone in a college sees everything"); `InstructorCourse` becomes semester-scoped; the `canAccessSemester`/`canAccessCourse`/`canManageCourse` authorization layer (`lib/server/access/`) built here and used everywhere after.
- **Phase 11** — `StudentSemesterAccess`/`InstructorSemesterAccess` (manual, semester-specific paid access) and `AccessPayment` (append-only audit trail). No payment gateway — Admin/Moderator enters an amount and flips a switch, from the console.
- **Phase 12** — `CourseChapter`; Notes/Assignments gain `publishedAt` ("Save for Students," replacing the old per-student "Send" flow entirely). `NoteAccess`/`AssignmentAccess` and `sendRecipients.ts` are **deleted** — visibility is now computed (paid + enrolled + published), not granted per student.
- **Phase 13** — Real Start/End Study session tracking (`POST /study-sessions/start` → `.../​:id/end`, duration computed server-side) replacing single-shot duration logging and the old `openedAt` concept entirely. Course-level analytics dashboards — chapter-level aggregate breakdowns were considered and explicitly rejected as dashboard clutter (a course's chapters are its notes, so it's near-duplicate of note-level detail); per-student chapter context is still surfaced (`lastStudiedChapterTitle`, `mostStudiedContent.chapterTitle`) where it's actually useful.
- **Phase 14** — `Assignment.type` (INDIVIDUAL/GROUP, immutable). **Instructor gains full parity with Notes** — create, generate, and publish Assignments themselves via the API, plus read access to submissions. This reverses Phase 0-9's "Instructor has zero Assignment access" rule; see `BACKEND_BUILD_PLAN.md` §4b for why that reversal happened mid-build.
- **Phase 15** — `AssignmentSubmission`/`AssignmentSubmissionMember` — students submit (individually or as a tagged group); Admin/Moderator/Instructor can read submissions (read-only, no grading mechanism anywhere in this app).
- **Phase 16** — `AssignmentDistribution`/`AssignmentDistributionRecipient` — a submission's own submitter can generate study material from it (reusing the same generation pipeline, a third `QuestionUnit.sourceType`) and explicitly send it to eligible classmates. Never auto-broadcast, never called "tagging" (that's Phase 15's separate group-membership flow).
- **Phase 17** — Semester rollover: activating a new semester copies each enrolled student's course structure forward as an editable starting point and resets payment to unpaid, atomically, idempotently. Instructor course assignments do NOT auto-roll-forward — reassigned fresh each semester by design.

## Known environment limitation (not a bug)

Prisma's engine binaries come from `binaries.prisma.sh`, unreachable from the
sandbox this was built in — so `prisma generate`/`migrate` couldn't be run or
tested here, only `svelte-check`. Every remaining type error traces to "no
generated Prisma client yet" and disappears the moment you run
`npm run db:local:migrate` (or `db:production:migrate`) with real internet
access, like this Codespace has. The Groq and CORS/API-fetch code in
Phase 4 and 6 has the same caveat — written against Groq's documented
shape, not yet exercised live. **This is the one real gap before
calling this production-ready**: everything here type-checks and reads
correctly, but the actual `npm install` → migrate → run cycle, and the first
live Groq call, haven't been watched succeed end-to-end by anything
but careful reading. Budget time for that first real run to surface anything
this review missed. **Phases 9 through 17 all have zero runtime
verification** — run `npm run db:local:migrate`, then `npm run seed:demo`
(now updated for Phase 10+ — creates and activates a Semester, enrolls and
activates payment for every demo student and the demo instructor — see the
note below), then click through: a Note's
test flow, an Assignment's drill flow, creating and activating a second
Semester to exercise rollover, a student submitting an Assignment and
distributing it to a classmate, and the PDF reading flow end to end — before
trusting any of it.

**`npm run seed:demo` was updated for Phase 10+.** It previously targeted
the Phase 0-9 data model directly (`NoteAccess` grants, no semester) and
would have failed outright against the current schema. It now creates and
activates a Semester, enrolls every demo student in the demo course with
paid access, gives the demo Instructor a paid, course-assigned account, and
publishes the demo Note/Assignment (rather than granting them) — see
`prisma/seedDemo.ts`'s own comments for what it still deliberately doesn't
seed (no `AssignmentSubmission`/`AssignmentDistribution` demo data, and the
hand-seeded demo Assignment has no `pdfUrl` since it bypasses the real
upload endpoint that would normally produce one).

## 18 phases are built (Phases 9–17 unverified — see above)

From here: run the first real end-to-end test in
your Codespace (per `docs/RUNBOOK.md`'s first-time setup),
get a real Groq key in, and start pointing a Frontend
app at `/api/v1/**` — `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` is the
current contract.