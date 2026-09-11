# Phase 9 — Chapter Tests (Notes) & Self-Paced Drills (Assignments)

> **Superseded in parts as of Phase 12/14 (v8) — kept as a historical
> record.** Every "Instructor has zero Assignment access" statement below
> is reversed as of Phase 14 — see `docs/phases/PHASE_6.md`'s updated
> notice and `BACKEND_BUILD_PLAN.md` §4b. `NoteAccess`/`AssignmentAccess`
> (the "once granted, permanent" pattern referenced below) no longer
> exist as of Phase 12 — see `docs/phases/PHASE_5.md`. The actual chapter
> test / drill mechanics described below — one attempt per student per
> Note test, repeatable self-paced Assignment drills, the most-recent-
> attempt reveal rule — are all unchanged and still current.

## Where this came from

A college dean, after seeing the product, asked for a way to actually measure whether a student understands the material — not just whether they opened it. The existing engagement signal (Phase 7) answers "are they studying at all"; it can't answer "did they pass." This phase adds that second signal, plus a rewrite of `QuestionUnit` from free-text Q&A to multiple choice, which is what makes an objective score possible in the first place.

Two independent workflows came out of the discussion, and it's important they stay independent:

- **Notes → chapter tests.** Instructor-controlled, batch-graded, one attempt per student, gated by two instructor actions (start, then reveal). This is the dean's original ask: "instructor finds it harder to track student progress... they take the test and still failed."
- **Assignments → self-paced drills.** Entirely student-controlled, repeatable, no staff involvement anywhere. This surfaced later in the same discussion, once it was clarified that Assignments are a study/practice tool ("meant for students to study their assignment and present well"), not an administrative one — so they get self-gating instead of instructor-gating.

Do not merge these two mechanisms. They look superficially similar (hide the answer, reveal it later) but the *who controls the gate* is the entire point of keeping them as separate models (`NoteTestAttempt` vs. `AssignmentDrillAttempt`).

## The QuestionUnit pivot (affects both Notes and Assignments)

`QuestionUnit` is a single shared model used by both `sourceType: "NOTE"` and `sourceType: "ASSIGNMENT"` — same generation pipeline, same prompt (`buildGenerationPrompt`). Changing its shape was therefore unavoidably global:

| Before | After |
|---|---|
| `question`, `answer`, `explanation?`, `example?` | `question`, `optionA`–`optionD`, `correctOption` (`"A"\|"B"\|"C"\|"D"`), `explanation?` |

`example` moved off `QuestionUnit` entirely and onto `DictionaryEntry` (`example: String?`) — the dean's own framing: "the dictionary will now be used to break down key words and then give an example of that word."

This was a **hard cutover, not a migration** — confirmed against the actual state of the app before building: `seedDemo.ts` hand-seeds two free-text `QuestionUnit`s with no real Gemini/Groq call behind them, and the generation pipeline had never been exercised against a live provider in this codebase. There was no real generated data anywhere to preserve, so the schema change is a straight replacement, no dual-format support, no backfill script.

**Generation validation** (`schema.ts`) now rejects duplicate options via a Zod `.refine()`, and `correctOption` is checked against the enum, not just "any string" — a model returning an out-of-range answer fails validation and hits the existing retry-once path instead of silently writing bad data.

**The prompt** (`prompt.ts`) was rewritten for MCQ, keeping the lesson learned in the Phase 4 amendment intact: a fully-populated worked example, not just a schema description, because weaker fallback models (Groq) under-deliver on optional-looking fields otherwise. The rules now also require distinct, plausible wrong options — no "all of the above," no filler that a skimming student would still get right.

## Notes: chapters, and the chapter-test workflow

### What a "chapter" is (deliberately not what it first looked like)

The first framing of this problem treated "chapter" as a new structural concept requiring an auto-splitter, similar to how `Assignment` gets its `[SECTION:]` markers. That turned out to be solving a problem that didn't need solving: the dean's own resolution was **"we could upload per what we needs to be generated as that specific chapter or section."**

So a chapter is not derived from a Note — it's a **label on a Note**, by upload convention. One Note = one chapter's worth of content, same as `AssignmentSection`'s existing precedent of "display grouping, not a generation boundary" (see Phase 3). This is the entire schema footprint for the concept:

```prisma
model Note {
  ...
  chapterLabel String?   // e.g. "Chapter 3" — set at upload time
}
```

No auto-splitting exists or is planned for this phase. The dean flagged this himself as a future automation, not a Phase 9 requirement.

### The test itself has no separate entity

The first design draft of this phase included a `Test` model — instructor curates a named subset of a chapter's questions ("1–10," "1–8 or 15"), assigns it to specific students, students attempt that named Test. **This was corrected during discussion and is not what got built.** Two decisions killed it:

1. Confirmed directly: *"every generated question for that chapter is always the test"* — no range curation, no subset. An instructor never picks which questions count.
2. Confirmed directly: assigning access still requires an existing `NoteAccess` grant — there's no new assignment mechanism layered on top of "send."

With both of those settled, a `Test`/`TestAssignment`/`TestQuestion` object graph would have added structure with nothing left for it to do. What's actually needed is two timestamps on `Note` itself and a record of what a student submitted:

```prisma
model Note {
  ...
  testStartedAt   DateTime?   // instructor's "alert test time" action
  testRevealedAt  DateTime?   // instructor's "done" action
}

model NoteTestAttempt {
  id          String   @id @default(cuid())
  studentId   String
  noteId      String
  submittedAt DateTime @default(now())
  score       Int

  @@unique([studentId, noteId])   // one attempt only, ever — confirmed explicitly
}

model NoteTestAnswer {
  id             String  @id @default(cuid())
  attemptId      String
  questionUnitId String
  selectedOption String
  isCorrect      Boolean
}
```

### The reveal mechanism — why it's a big deal that it's batch, not per-student

Directly from the dean's own explanation of *why* this needs to work this way, worth preserving verbatim in intent even though the wording here is paraphrased: revealing an individual student's result the moment they submit creates a leak — a fast finisher could pass the answer to a friend still taking the test. The fix is that reveal is a **single action, scoped to the whole chapter, taken by the instructor once everyone's done** — not a per-student unlock.

That's why `testRevealedAt` lives on `Note`, not on `NoteTestAttempt`. `POST /notes/:id/test/done` flips one timestamp and every student who attempted that chapter gets unlocked at once.

**Amendment — the gating is two-stage, not one-stage.** The first version of this endpoint only withheld `correctOption`/`explanation`; the question text and options themselves were always visible to a student, treated as ordinary study material. That's wrong for Notes: the entire question set — question text and options, not just the answer — must stay invisible to a student until `testStartedAt` is set, i.e. until the instructor actually "sparks" the test. Before that, a student sees the Note's `rawText` and dictionary as normal, but `questionUnits` comes back as an empty array. `correctOption`/`explanation` remain a *second*, later gate on top of that, unlocked only by `testRevealedAt`. `DictionaryEntry` is unaffected either way — it's general study reference material, not test content, so it stays visible regardless of test state. This distinguishes Notes sharply from Assignments, where the equivalent question set is meant to be freely practiced any time (see the Assignments section below) — don't let the two flows blur together when implementing either one.

### Instructor role boundary — this is new territory for that role

Every other Instructor capability in this app up to Phase 8 is upload-only, or read-only ("my students," "my courses"). Generate and send have always been Admin/Moderator-only, deliberately, per the build plan's §2/§4/§6 resolution of an earlier design contradiction. **Starting and revealing a chapter test is the first time an Instructor account can affect what a student sees.** This was flagged explicitly during the design discussion and accepted as an intentional, narrow exception — not a broadening of the role. Generation and sending are completely untouched; the Instructor still never generates content and never grants `NoteAccess`.

Both new instructor actions reuse the exact same scoping every other Instructor route uses — `requireInstructorCourseAccess` against the Note's `courseId`, via `InstructorCourse`. No new permission concept was introduced.

### API surface (Notes)

- `POST /api/v1/notes/:id/test/start` — Instructor-only, scoped. Sets `testStartedAt`. Idempotent (re-clicking is a no-op).
- `POST /api/v1/notes/:id/test/done` — Instructor-only, scoped. Sets `testRevealedAt`. Rejects if the test was never started.
- `POST /api/v1/notes/:id/test/submit` — Student-only. Requires `testStartedAt` to be set. One attempt, enforced by `@@unique([studentId, noteId])` at the database level, not just an application check — a race between two concurrent submits is caught by the constraint and returned as a clean `conflict`, not a 500. Every submitted `questionUnitId` is checked against the Note's actual question pool and de-duplicated before scoring. The response never includes the score or any per-question correctness — just `{ submitted: true }`.
- `GET /api/v1/notes/:id` — extended, not replaced. For a student: `questionUnits` is `[]` unless `testStartedAt` is set; once started, the full list is returned with `correctOption`/`explanation` still `null` on every question until `testRevealedAt` is also set. A `test` object reports `{ started, revealed, myAttempt }`, where `myAttempt.score` is itself `null` until revealed even though the attempt exists. Staff (Instructor, viewing their own course) always see everything at every stage — the gate is student-only.

### Console surface (Notes)

- Upload form (`notes/new`) gained an optional `chapterLabel` field.
- Note detail page shows MCQ options with the correct one highlighted (for Admin/Moderator review — never gated, they built the thing), a test-status badge (`Test in progress` / `Test revealed`), and per-student test status inline in the "Sent to" list (not submitted / submitted / revealed-with-score).
- List page and `instructors/courses/:courseId/content` API both surface `chapterLabel` and `{ started, revealed }`.

### Analytics — additive, not a replacement

`computeChapterTestScores()` (new, in `courseProgress.ts`) returns per-student, per-chapter score history — but **only for revealed attempts**, matching the same withholding rule as everywhere else; an instructor doesn't get to see a score before they've clicked "done" themselves. This is merged into `GET /instructors/me/students` as an additive `chapterTests` array alongside the existing engagement classification, not blended into it — the dean's own framing, preserved: "are they opening the material at all, **and** are they passing the tests," two signals, not one replacing the other.

## Assignments: self-paced drills

### Why this isn't the same mechanism as Notes, even though it looks similar

This was a correction made mid-build, after an initial pass wrongly generalized the Notes gating to Assignments. The actual requirement: **Assignments are a study tool students use to prepare, not something administration or an instructor controls at all.** *"A student can start their drill anytime and end it anytime they want. But unless a drill ends, the correct answer won't be shown."*

That's a fundamentally different shape of gate — self-triggered, repeatable, per-student, with zero staff involvement — so it gets its own models rather than reusing `NoteTestAttempt`:

```prisma
model AssignmentDrillAttempt {
  id           String    @id @default(cuid())
  studentId    String
  assignmentId String
  startedAt    DateTime  @default(now())
  finishedAt   DateTime? // null while in progress
  score        Int?
  // no @@unique — repeatable, unlike NoteTestAttempt
}

model AssignmentDrillAnswer {
  id             String  @id @default(cuid())
  attemptId      String
  questionUnitId String
  selectedOption String
  isCorrect      Boolean
}
```

### Reveal tracks the *most recent* attempt only

The first pass made a completed drill unlock the assignment permanently, matching the app's general "once granted, permanent" pattern (`NoteAccess`/`AssignmentAccess`). **This was corrected**: reveal should re-hide the moment a student starts a new drill, so each round is independently blind until finished. `GET /api/v1/assignments/:id` now looks only at the single most recent `AssignmentDrillAttempt` (by `startedAt`) — if it's finished, reveal; if it's in progress or doesn't exist, hide. Past finished attempts still contribute to a `bestScore` summary field, but they don't affect the current reveal state.

### API surface (Assignments)

- `POST /api/v1/assignments/:id/drill/start` — Student-only. Idempotent against an already-in-progress attempt (returns the existing one rather than creating a duplicate); otherwise creates a new `AssignmentDrillAttempt`.
- `POST /api/v1/assignments/:id/drill/submit` — Student-only. Finds the caller's in-progress attempt, scores it, sets `finishedAt`. Unlike the Note test submit endpoint, **the response includes the full reveal immediately** — `correctOption`, `isCorrect`, and `explanation` per answer, plus the score — because there's no external party who needs to approve that reveal first. This is the literal implementation of "the correct answer will show after the short drill."
- `GET /api/v1/assignments/:id` — Student-only via this API (unchanged: Instructor has zero Assignment access, Admin/Moderator use the console). Adds a `drills` summary object (`completedCount`, `inProgressAttemptId`, `bestScore`, `totalQuestions`) and gates `correctOption`/`explanation` per the most-recent-attempt rule above.

### Console surface (Assignments)

Purely informational — there is nothing for a staff member to start, stop, or reveal here, and the UI copy says so explicitly. List page gained a "Drilled by" column counting **distinct students** who've finished at least one drill (via `distinct: ['assignmentId', 'studentId']` — a student drilling five times still counts once). Detail page groups every student's attempts into a per-student summary (finished count, best score, in-progress flag) shown inline in the "Sent to" list, same visual pattern as the Notes page but built from different underlying data since there's no `testRevealedAt`-style flag to check.

### Not fed into instructor analytics

Deliberate: `computeChapterTestScores()` only covers Notes. Drill data doesn't reach `GET /instructors/me/students` at all — Instructor has no Assignment access of any kind (Phase 6's boundary, untouched by this phase), and drills are self-study, not something an instructor is meant to be grading anyway.

## Student home list (`GET /api/v1/students/me/content`)

Extended so a student's list of sent content can show what needs attention without a follow-up request per item:
- Notes: `test: { started, revealed, submitted, score }` — `score` is `null` unless revealed, same rule as everywhere else.
- Assignments: `drill: { inProgress }` — just enough to show a "resume drill" affordance; full detail still comes from `GET /assignments/:id`.

## Summary of every touched/added file

**Schema:** `prisma/schema.prisma` — `Note.chapterLabel/testStartedAt/testRevealedAt`, `QuestionUnit` MCQ pivot, `DictionaryEntry.example`, `NoteTestAttempt`, `NoteTestAnswer`, `AssignmentDrillAttempt`, `AssignmentDrillAnswer`, plus back-relations on `Student`, `Assignment`, `QuestionUnit`.

**Generation:** `src/lib/server/generation/schema.ts`, `prompt.ts`, `generate.ts`.

**API — Notes:** `src/routes/api/v1/notes/[id]/+server.ts` (gating), `.../test/start/+server.ts`, `.../test/done/+server.ts`, `.../test/submit/+server.ts` (all new).

**API — Assignments:** `src/routes/api/v1/assignments/[id]/+server.ts` (gating), `.../drill/start/+server.ts`, `.../drill/submit/+server.ts` (all new).

**API — Instructor:** `src/routes/api/v1/instructors/courses/[courseId]/content/+server.ts` (chapterLabel + test status), `.../instructors/notes/+server.ts` (accepts `chapterLabel`), `.../instructors/me/students/+server.ts` (merged `chapterTests`).

**API — Student:** `src/routes/api/v1/students/me/content/+server.ts` (test/drill summaries).

**Analytics:** `src/lib/server/analytics/courseProgress.ts` — new `computeChapterTestScores()`.

**Console:** `notes/new`, `notes/[id]`, `assignments/[id]`, `assignments/+page.server.ts`/`+page.svelte` — all updated for MCQ rendering and the two independent status/control surfaces described above.

**Console — Send (added post-launch, see amendment below):** `src/lib/server/sendRecipients.ts` (new — shared College-scoping guard), `notes/[id]/send/+page.server.ts`/`+page.svelte` (new), `assignments/[id]/send/+page.server.ts`/`+page.svelte` (new). `notes/[id]/+page.server.ts` and `assignments/[id]/+page.server.ts` had their `send`/`revoke` actions and candidate-search logic removed — that page is generate/review-only now.

**API — Notes gating fix (post-launch):** `src/routes/api/v1/notes/[id]/+server.ts` — `questionUnits` now empty for a student until `testStartedAt`, not just `correctOption`/`explanation` gated.

**Seed data:** `prisma/seedDemo.ts` — MCQ-shaped Note question units, plus a full demo chapter-test round (started → one attempt, one right/one wrong → revealed) so the workflow has real data to inspect immediately after seeding.

## Amendment — the "send" flow had no College guard at all (real incident)

Discovered during administration testing: a student in the Business college ended up with access to a Health Science Note. Root cause was pre-existing (not introduced by Phase 9, just surfaced by wider real-world use) — the console's student search for both Notes and Assignments had **no College filter whatsoever**, despite a code comment claiming it was "a helpful default filter." Any staff member could search and send to any student system-wide.

Fixed with two layers, both required, in `src/lib/server/sendRecipients.ts`:

1. **UX layer** — sending moved out of the generate/review page entirely, into a dedicated `notes/:id/send` / `assignments/:id/send` console page. Instead of a free-text search across every student, it lists students **grouped by College**, restricted to Colleges actually linked (via `CourseCollege`) to the content's Course — there's no search box that could return an out-of-scope student in the first place.
2. **Enforcement layer** — `assertStudentInCourseScope()` is called from the send form action itself, not just used to build the list. Even if a future UI bug re-offers an ineligible student, or someone crafts a raw POST, the write is rejected server-side. This is the actual guarantee; layer 1 is just making the correct choice the easy one.

The old `send`/`revoke` actions and inline search UI were removed from `notes/[id]/+page.server.ts` and `assignments/[id]/+page.server.ts` entirely — that page now only generates/reviews content and links to the dedicated Send page, which owns the full sent-to list and revoke action too.

**Instructor scoping was checked and is unaffected** — an Instructor's visibility has always been Course-scoped via `InstructorCourse`, not College-scoped, and correctly does *not* mean "every student in a College this Instructor happens to teach a course for." That distinction (Course-tied, not College-wide) was already correct; this incident was specific to the console's manual send flow for Notes/Assignments.

## Amendment — console account management was incomplete

A separate audit while fixing the above found real gaps, unrelated to Phase 9's actual scope but discovered alongside it: the console had student/staff *rosters* (list, create for staff, Admin-only delete/deactivate for both) but **no way to edit anything** — a typo'd name, a changed College, a role change, or a forgotten password meant deleting and recreating the account, losing its history. Fixed:

- `console/students/[id]` (new) — edit name/studentCode/College, revoke individual Note/Assignment grants, delete. Linked from the students list.
- `console/staff/[id]` (new) — edit name/role, reset password (invalidates their sessions), assign/unassign courses (for Instructors), deactivate. Linked from the staff list.
- `POST /api/v1/students/me/password` and `POST /api/v1/instructors/me/password` (new) — neither role had any self-service way to change their own password before this; needed for the Frontend's account-management pages (see `docs/FRONTEND_BUILD_GUIDE.md` §9) to be real rather than aspirational.

## Amendment — "opened" tracking only ever fired once, and the test dashboard didn't exist

Two more real gaps, found via the same round of feedback:

**`POST /notes/:id/open` and `/assignments/:id/open` were idempotent — they only ever stamped `openedAt` the first time, silently no-op'ing on every subsequent call.** An earlier Frontend build only ever called `open` (never `study-sessions`) and only once, so nothing about repeat visits or actual time spent was ever recorded. Fixed on the backend side: both endpoints now update `openedAt` on every call. This is safe — nothing downstream (engagement's `neverOpened` check) cared about which specific timestamp was stored, only whether it was null at all — so `openedAt` now means "most recently opened," which is strictly more useful. The other half of the fix is procedural, not code: `docs/FRONTEND_BUILD_GUIDE.md` §5a now spells out explicitly that `open` (every visit) and `study-sessions` (every visit, with the actual duration) are two separate, both-required calls — this exact gap is why that section exists.

**There was no data source for a per-chapter "who's submitted, how'd they do" instructor dashboard.** `computeChapterTestScores` (feeding `GET /instructors/me/students`) is shaped per-student, right for "how's this one student doing" but wrong for "how did the whole class do on this chapter" — and it also only counted *revealed* attempts, inconsistent with every other staff-facing endpoint in this app always showing staff everything. Fixed: `computeChapterTestScores` now returns every attempt with a `revealed` flag per entry instead of filtering unrevealed ones out, and a new `GET /api/v1/instructors/notes/:id/results` returns the per-chapter, all-students shape a real dashboard needs (`submitted[]` sorted by score, `notYetSubmitted[]`), explicitly not gated by reveal state — the instructor needs to see this *before* deciding whether to reveal, not after. See `docs/FRONTEND_BUILD_GUIDE.md` §8a for the intended page.

## Amendment — a product-direction conversation, and what it actually changed

Reflecting on the pilot, the product owner reframed the goal: this isn't primarily an instructor-tracking tool, it's meant to help a student pass their (offline, instructor-drawn-from-the-Note) exam faster — by studying against a pre-test drawn from the same material first. Two conclusions came out of that, one confirming existing design and one adding real scope:

**Confirmed, unchanged:** hiding the whole question set until the pre-test starts, then hiding just the answers until it ends (§"Amendment — the gating is two-stage" above) is exactly right for this framing — a student who saw the questions freely might just memorize answers instead of actually learning the material; a student who has to earn the reveal by taking the pre-test first is being pushed toward genuine study, then handed the answer key to consolidate afterward. No code changed here.

**New:** not every Instructor will run this cycle for every chapter — some won't have the time. Left as Instructor-only, a chapter with no active Instructor would simply have no accessible pre-test at all, ever. So:

- **Admin/Moderator got the exact same start/end actions an Instructor has**, directly in the console (`console/notes/[id]/+page.server.ts`'s new `startTest`/`endTest` actions) — same fields, same rules, just reached via direct Prisma instead of the bearer-token API, matching how every other console mutation in this app works.
- **A third action, Admin/Moderator-only: `overrideReveal`.** Skips the whole cycle and sets `testStartedAt`/`testRevealedAt` together in one click — students see the full Q&A immediately as pure study material, no submission required. This needed no new field or gating logic at all; the existing `GET /notes/:id` behavior already produces exactly this the moment both timestamps are set, attempt or no attempt. The entire "feature" is one console button.
- **A new console page, `console/notes/[id]/results`**, mirrors the Instructor-facing dashboard (§ above) for Admin/Moderator — same shape, same "not gated by reveal" rule, direct Prisma instead of the API.

## Amendment — an admin-wide progress dashboard, across every College

Separately: "we need to know in order to strengthen our marketing next semester" — a cross-college view of both engagement (reading time) and chapter-test performance, which nothing in the console previously provided; the only progress view was a single per-course detail page (`console/progress/[courseId]`, Phase 7), reachable only if you already knew a `courseId` and with no chapter-test data on it at all.

New drill-down structure: `console/progress` (top-level — global totals: student×course pairs, engagement bucket counts, total chapter-test attempts, weighted-average score) → `console/progress/college/[collegeId]` (that College's linked Courses, each with an engagement + test-score summary row) → `console/progress/[courseId]` (existing page, now also showing each student's chapter-test history, not just engagement).

Three new aggregate functions in `courseProgress.ts`: `computeCourseChapterTestSummary` (one course's attempt count + average score), `computeCollegeCourseSummaries` (a College's linked Courses, each summarized), `computeGlobalProgressOverview` (everything, iterating distinct Courses directly rather than summing per-College numbers, so a Course linked to two Colleges — which intentionally appears in both College-level breakdowns — doesn't get double-counted in the *global* total). All three are straightforward per-course-loop aggregation, same "compute at query time" approach as the rest of this file — fine at pilot scale, worth revisiting with caching if course count grows substantially.

`console/progress` is now a real top-level nav item (it wasn't before — the nav explicitly commented that Progress was course-scoped-only by design, which stopped being true the moment this page existed).

## Amendment — multiple Groq keys, and a fixed display font for extracted content

Two smaller, unrelated fixes bundled into the same pass:

**Groq key rotation.** `env.ts` now supports up to 5 Groq API keys (`GROQ_API_KEY` through `GROQ_API_KEY_5`, all optional beyond the first) via a new `config.groqApiKeyOptions` list and `getGroqApiKeyByLabel()` lookup. `callGroq()` takes an explicit `apiKey` parameter now instead of always reading one fixed env var (defaults to the first configured key, so nothing breaks for anyone not using the new picker). `runGeneration()` gained a `forceGroqKeyLabel` option — when set, it skips Gemini entirely and calls exactly that Groq key, with its own validate-and-retry-once, no further fallback. The console's Note/Assignment "Generate" forms show a key-picker dropdown (only rendered at all if more than one key is configured) — leave it on "Auto" for the unchanged default behavior, or force a specific key, e.g. to route around a rate-limited account or spread load across several on purpose.

**Fixed display font for extracted content.** `rawText`/section `content` is plain text extracted via `pdf-parse`/`mammoth` — there is no font or formatting metadata anywhere in that pipeline to preserve, regardless of how the original source document looked. Rather than something that could be "fixed" at the data layer, this is a display rule: both console review pages (`notes/[id]`, `assignments/[id]`) now render this content at a fixed `Times New Roman, 12pt` regardless of source. `docs/FRONTEND_BUILD_GUIDE.md` §4a carries the same instruction forward to the Frontend's own reading views, so the whole app renders extracted content consistently no matter how messy the original upload was.

## Amendment — Gemini removed entirely; font-forcing reversed in favor of manual editing

Two more changes, close together:

**Gemini is gone.** Groq is now the sole generation provider — not a fallback for anything. `src/lib/server/generation/providers/gemini.ts` was deleted outright. `env.ts` no longer has any Gemini config. `generate.ts`'s `runGeneration` no longer tries Gemini first; it calls Groq directly with either the default (first-configured) key or a specific one passed via `forceGroqKeyLabel` (same picker from the previous amendment), with its own validate-and-retry-once and no further fallback. Every doc/comment referencing "Gemini primary, Groq fallback" was updated — `BACKEND_BUILD_PLAN.md`, `README.md`, `README_HANDOFF.md`, `.env.example`, and inline comments across the generation code — except the historical `docs/phases/PHASE_4.md`/`PHASE_4_AMENDMENT.md`, left as an accurate record of what Phase 4 actually built at the time, same principle as every other phase doc in this project.

**The font-forcing approach from the previous amendment was reversed.** On reflection, forcing a specific font/size on the Frontend's rendering was the wrong lever — the Frontend should render exactly what the backend sends, nothing overridden client-side. The actual problem (some uploads extract messy) is better solved at the source: Notes and Assignments both gained a direct **edit** capability in the console (`editText` action, `notes/[id]` and `assignments/[id]`) — a plain textarea, Admin/Moderator only, letting staff clean up extracted text by hand after upload. Editing an Assignment's text also re-runs the deterministic `[SECTION:]` splitter (`assignmentSections.ts`) so its `AssignmentSection` rows never go stale against edited text. Neither edit touches `generatedAt` or existing `QuestionUnit`s — if a text edit is substantial enough to warrant it, Regenerate is a separate, deliberate click. The console's own `.raw-text` CSS was reverted back to its original plain style (no forced font), and `docs/FRONTEND_BUILD_GUIDE.md`'s font-instruction section was removed and replaced with one line: render `rawText` as sent, no overrides.



Same as every prior phase: this was built in a sandbox whose network doesn't allow `binaries.prisma.sh`, so `prisma generate`/`migrate` could not be run here. Nothing in this phase has been typechecked or executed. Run `npm run db:local:generate && npm run db:local:migrate` in the actual Codespace before relying on any of this.

## Exit criteria

- [ ] Admin/Moderator can upload a Note with a `chapterLabel`, generate it, and see MCQ question units with the correct option highlighted in the console
- [ ] An Instructor can start a chapter test on a Note in their own course (and gets `no_access` on a course they're not assigned to)
- [ ] A student cannot submit before `test/start`, can submit exactly once (a second attempt returns `conflict`), and sees `test.myAttempt.score` as `null` until the instructor calls `test/done`
- [ ] After `test/done`, the same student's `GET /notes/:id` shows `correctOption`, `explanation`, and their real score; the console's per-student badge on that Note shows the score too
- [ ] `GET /instructors/me/students` includes `chapterTests` for revealed attempts only, alongside the unchanged engagement classification
- [ ] A student can `drill/start` on an Assignment, `drill/submit`, and see the full reveal in that same response — no staff action anywhere in that path
- [ ] After finishing a drill, `GET /assignments/:id` shows revealed answers; after calling `drill/start` again, the same endpoint hides them again until the new drill is finished
- [ ] The console Assignment pages show drill activity as read-only information, with no start/reveal controls anywhere on the page
- [ ] `GET /api/v1/assignments/:id` still returns `no_access` for every staff role, Instructor included — this phase didn't touch that boundary
- [ ] Before `test/start`, a student's `GET /notes/:id` returns `questionUnits: []` — not a populated list with only the answer hidden
- [ ] The Notes/Assignments "send" pages only ever list students in a College linked to the content's Course; attempting to POST a `studentId` outside that scope (e.g. via a raw request) is rejected server-side, not just hidden from the UI