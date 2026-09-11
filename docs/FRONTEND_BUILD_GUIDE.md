# Frontend Build Guide — Study Companion

> **⚠️ SUPERSEDED as of Phase 10+ (v8).** Everything in this guide's §1 that said the Semester/paid-access rework was merely "designed and discussed but not built — don't build against it yet" **is now built and IS what you build against.** `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` is the current authoritative reference — read that first. This doc is kept as historical context for the Phase 0-9 API shape (auth mechanics, general Note/Assignment reading, the console/API split) that's mostly still accurate for what it covers, but its access-model sections (who sees what, and why) describe a model that no longer exists: there is no more "sees only Notes/Assignments explicitly sent to them" — see the new doc's §2-§4 for what replaced it.

**This is the primary, authoritative reference for building the Frontend project against this backend.** It supersedes `docs/FRONTEND_HANDOFF_PHASE_9.md` as the thing to read first — that doc is now historical context for what changed *in* Phase 9 specifically; this one covers the whole app, ground up, as it actually exists in the backend today.

This guide reflects only what's actually built and running (Phases 0–9, plus fixes made during Phase 9 administration testing). ~~There is a larger access-model rework (bulk account creation, paid semester access, locking) that has been designed and discussed but **not built** — nothing in this guide assumes it. If you hear about "Semester," "bulk-created accounts," or "locked accounts" from anyone, that's forward planning, not something to build against yet.~~ **This paragraph is the specific part now wrong — see the notice at the top of this file.**

---

## 1. What this app is, and who builds against this API

Two products consume this backend:

- **The backend console** (`/console/**`) — already built, server-rendered, cookie-authed, used only by Admin/Moderator staff. Not your concern.
- **The Frontend** (what you're building) — talks exclusively to `/api/v1/**` over bearer-token auth, CORS-locked to your origin. Serves two very different audiences in one app:
  - **Students** — the actual end users. This is the product's real face, and for many of them, their first and only touchpoint with the platform. This side needs to feel like a genuine product, not an admin tool — warm, quick, mobile-first, low-friction. Assume most usage is on a phone, often on mediocre connectivity.
  - **Instructors** — labeled "Administrator" in the Frontend's own UI language (this app's own convention, not a mistake). **As of Phase 14, this is no longer a narrow slice** — see the superseded notice above; Instructor now has full Note AND Assignment create/generate/publish/read involvement, not just Notes-upload-plus-progress-viewing. Everything about course/college *structure* (creating them) is still invisible to them by design — only content creation expanded, not structural admin.

**Design tone: this is not the console.** The console is a utilitarian internal tool — dense tables, plain forms, no personality, and that's correct for its audience. The Frontend is the actual product, and for a lot of prospective colleges, a demo of this Frontend *is* the pitch. Treat it accordingly: real typography, real spacing, a color identity, motion where it earns its keep (a test being revealed, a score animating in), and copy that sounds like a person wrote it, not a system message. Mobile-first for the Student side specifically — assume a phone screen is the primary surface, not a shrunk-down desktop layout.

---

## 2. Auth

Three account-creation/login paths exist today. All three return `{ token, expiresAt, <role>: {...} }` on success — store the token, send it as `Authorization: Bearer <token>` on every subsequent request.

| Action | Endpoint | Body | Notes |
|---|---|---|---|
| List colleges (for the signup dropdown) | `GET /api/v1/colleges` | — | Public, no auth needed. Returns `{ colleges: [{ id, name }] }` only — nothing else about a college is exposed here. |
| Student signup | `POST /api/v1/students/signup` | `{ name, studentCode, password, collegeId }` | Self-service — a student picks their own `studentCode` (their school ID or whatever they choose) and password. `studentCode` must be unique; a duplicate returns `409 conflict`. Rate-limited: 5/hour/IP. |
| Student login | `POST /api/v1/students/login` | `{ studentCode, password }` | Rate-limited: 10/15min/IP. Error message is deliberately generic either way ("incorrect student code or password") — never confirm/deny whether an account exists. |
| Instructor login | `POST /api/v1/instructors/login` | `{ name, password }` | Instructors log in by **name**, not a student-code-style identifier — their account is created by an Admin in the console, name and password included. No self-service Instructor signup exists or should exist. |
| Student change password | `POST /api/v1/students/me/password` | `{ currentPassword, newPassword }` | New — see §7. Requires the current password even though the session already proves login; changing a password is worth re-confirming identity for. |
| Instructor change password | `POST /api/v1/instructors/me/password` | `{ currentPassword, newPassword }` | New — see §7. |

There's no logout endpoint that needs calling — just discard the token client-side. (Password-change does invalidate *other* sessions server-side, but not the one making the request.)

**Error shape, everywhere:** `{ error: { code, message } }`. Branch UI behavior on `code`, show `message` to the user directly — it's already written to be user-facing, not a debug string.

---

## 3. Complete API reference

### Student-facing

| Method & path | Purpose |
|---|---|
| `GET /api/v1/students/me/content` | Everything sent to this student — notes and assignments, each with a lightweight status summary. Your home/dashboard screen's data source. See §5. |
| `GET /api/v1/notes/:id` | Full Note content — see §6, this is the complex one. |
| `POST /api/v1/notes/:id/open` | Call **every time** a student opens a Note, not just the first. See §5a. |
| `POST /api/v1/notes/:id/test/submit` | Submit chapter test answers — see §6. |
| `GET /api/v1/assignments/:id` | Full Assignment content — see §7. |
| `POST /api/v1/assignments/:id/open` | Call **every time** a student opens an Assignment, not just the first. See §5a. |
| `POST /api/v1/assignments/:id/drill/start` | Begin/resume a self-paced drill — see §7. |
| `POST /api/v1/assignments/:id/drill/submit` | Finish a drill — see §7. |
| `POST /api/v1/study-sessions` | Log study time. Body: `{ noteId, durationSeconds }` OR `{ assignmentId, durationSeconds }` (exactly one of the two id fields). Called every reading session, alongside `open` — see §5a, this pairing was implemented wrong once already. |

### Instructor-facing ("Administrator")

| Method & path | Purpose |
|---|---|
| `GET /api/v1/instructors/me/courses` | The complete list of courses this Instructor can see — nothing exists for them outside this list. `{ courses: [{ id, name, courseCode }] }` |
| `GET /api/v1/instructors/courses/:courseId/content` | Notes under one course, list view: `{ notes: [{ id, title, chapterLabel, createdAt, generatedAt, uploadedByStaffId, test: { started, revealed } }] }`. Use `test.started`/`test.revealed` to decide which of the two action buttons (§6) to show per row without a separate fetch. |
| `POST /api/v1/instructors/notes` | Upload a Note. `multipart/form-data`: `courseId`, `title?`, `chapterLabel?`, plus either pasted text or a file field (same upload mechanics as everywhere else in this app — check `resolveUploadedContent`'s accepted field names if you're unsure, but functionally: paste text OR attach a PDF/DOCX). **Write-once — there's no edit/update endpoint for an Instructor's own upload, by design.** A mistake means re-uploading as a new Note, not fixing the old one. |
| `GET /api/v1/instructors/me/students` | Computed roster + progress across every course this Instructor teaches — see §8. |
| `POST /api/v1/notes/:id/test/start` | Opens a chapter test for submissions — see §6. |
| `POST /api/v1/notes/:id/test/done` | Reveals chapter test results — see §6. |
| `GET /api/v1/instructors/notes/:id/results` | Per-chapter test progress — every student's submission status and score, not gated by reveal state. Data source for a dedicated dashboard page — see §8a. |

~~**Instructor has zero Assignment access anywhere in this API** — no list, no read, no upload. Don't build any Assignment-related UI into the Instructor/"Administrator" section at all; a request would just come back `no_access`.~~

> **⚠️ WRONG as of Phase 14 (v8).** This table above is also incomplete as of Phase 10-17 — it's missing every new Instructor endpoint (`POST /instructors/notes/:id/generate`, `.../publish`, `POST /instructors/assignments`, `GET /instructors/courses/:courseId/assignments`, `POST /instructors/assignments/:id/generate`, `.../publish`, `GET /instructors/courses/:courseId/assignments/:id/submissions`, `GET/POST` analytics endpoints) rather than just this one wrong line. Don't treat this table as complete — use `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md`'s quick-reference table (§11) instead, which lists every current endpoint including what's new/changed.

---

## 4. Content model

Every question, whether under a Note or an Assignment, is now **multiple choice**:

```json
{
  "id": "...",
  "order": 0,
  "question": "What is the powerhouse of the cell?",
  "optionA": "The nucleus",
  "optionB": "The mitochondrion",
  "optionC": "The ribosome",
  "optionD": "The Golgi apparatus",
  "correctOption": "B",
  "explanation": "Mitochondria generate ATP through oxidative phosphorylation...",
  "isTable": false,
  "dictionaryEntries": [
    { "term": "Oxidative phosphorylation", "definition": "...", "example": "..." }
  ]
}
```

`correctOption` and `explanation` are **nullable, and whether they're null depends entirely on context** — see §6 and §7, this is the single most important thing to get right in the whole rebuild. `isTable: true` means the `question` field itself contains markdown for a table the student needs to interpret — render it as such, don't treat it as a plain string. `dictionaryEntries[].example` is optional even when present — some terms just get a definition.

**On `rawText`/`sections[].content` formatting:** render it plainly — whatever the backend sends is exactly what should display, no font or size overrides on the Frontend's part. Some source documents come in with messy extraction; that gets cleaned up at the source (staff can now edit a Note/Assignment's text directly in the console after upload), not papered over client-side.

---

## 5. Student home screen — `GET /api/v1/students/me/content`

> **⚠️ Response shape changed as of Phase 12/13 (v8).** `openedAt` is gone (no replacement field on this endpoint — see the notice on §5a below). The endpoint now also returns a top-level `semester` object and a `paid` boolean, and both arrays are always empty when `paid: false`. See `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` §8 for the current shape.

```json
{
  "notes": [
    {
      "id": "...", "title": "...", "course": { "id", "name", "courseCode" },
      "generated": true, "openedAt": "2026-08-20T...",
      "test": { "started": true, "revealed": false, "submitted": false, "score": null }
    }
  ],
  "assignments": [
    {
      "id": "...", "title": "...", "course": {...}, "generated": true, "openedAt": null,
      "drill": { "inProgress": false }
    }
  ]
}
```

Use `test`/`drill` here to badge each card without a per-item fetch — e.g. a red "Test open — take it now" pill on a Note whose `test.started` is `true` and `submitted` is `false`, or a "Resume drill" affordance on an Assignment with `drill.inProgress: true`.

**Deriving a "My Courses" view:** there's no dedicated courses-list endpoint for students — ~~deliberately not built, since it's fully derivable from data you already have~~. **This changed too** — `GET /api/v1/students/me/courses` now exists (Phase 10), scoped to enrollment specifically rather than derived from content. Prefer it over deriving from the content list, since a student can be enrolled in a course with no published content yet.

---

## 5a. Opening content and logging study time — two calls, every time, not once

> **⚠️ ENTIRELY REPLACED as of Phase 13 (v8).** Both endpoints described in this section (`POST /notes/:id/open` / `POST /assignments/:id/open`, and the single-shot `POST /study-sessions` with a client-reported `durationSeconds`) are **removed**. The real replacement is a genuine Start/End Study pair — `POST /study-sessions/start` then `POST /study-sessions/:id/end`, with duration computed server-side, never client-reported. This is also the new "opened" signal — there's no separate `openedAt` field anymore. Do not build the flow described below; see `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` §8 for the current one.

**This exact flow was implemented incompletely in an earlier build of the Frontend** — only `open` was ever called, and only on the very first open, so nothing after that first visit was ever recorded (no repeat opens, no actual reading time). Get this right:

There are **two separate calls, both fired every single time a student reads a Note or Assignment**, not just the first:

1. **On opening the content** (navigating into the reading view): `POST /notes/:id/open` or `POST /assignments/:id/open`. Fire-and-forget — don't block rendering on the response. This used to only update the first time; it now updates every time, so it doubles as "last opened at," which is more useful anyway. Call it on every visit, full stop.
2. **On leaving the content** (navigating away, closing the tab, backgrounding the app — whatever "done reading, for now" means in your UI): `POST /study-sessions` with the elapsed seconds since they opened it: `{ noteId: "...", durationSeconds: 143 }` (or `assignmentId`). This is what actually powers "time spent studying" in the analytics — it's an append-only log, so calling it every session is correct and expected, not something to dedupe or guard against calling twice.

Concretely: start a timer (`Date.now()` or equivalent) the moment the reading view mounts, alongside firing `open`. When the view unmounts / the student navigates away / the app backgrounds — whichever your platform's lifecycle gives you — compute the elapsed seconds and fire `study-sessions`. Handle the case where elapsed time is very small (e.g. under a couple seconds — an accidental tap-through) by just not bothering to log it; there's no hard minimum enforced server-side, but a flood of near-zero-duration sessions doesn't help anyone's analytics.

**Both calls, every time.** Neither one is a substitute for the other, and neither one is a "do this once and you're done" call.

---

## 6. Notes: the chapter-test flow (read this whole section before building any of it)

This is the part that's had the most back-and-forth getting right, including a real correction after an earlier version shipped wrong — so treat every rule below as load-bearing, not a suggestion.

### The core rule

**A Note's questions do not exist for a student, visibly, until an Instructor starts the chapter test.** Not "shown with the answer hidden" — genuinely absent, an empty list. Before that point, a student reading a Note sees only its `rawText` and `dictionaryEntries` (attached per-question, but you can flatten/dedupe them for a general glossary view — they're general study reference material and are **never** gated by test state). There is no "practice mode" for a Note's questions, ever — that concept exists only for Assignments (§7), and the two must not be visually or behaviorally interchangeable in your UI. If your design shows Note questions as a browsable quiz bank at any point before a test starts, that's wrong — remove it.

### `GET /api/v1/notes/:id` response

```json
{
  "id": "...", "title": "...", "chapterLabel": "Chapter 3", "rawText": "...",
  "course": { "id", "name", "courseCode" }, "generatedAt": "...",
  "test": {
    "started": true, "revealed": false,
    "myAttempt": { "submittedAt": "...", "score": null, "totalQuestions": 8 }
  },
  "questionUnits": [ /* see below — shape depends entirely on test state */ ]
}
```

`myAttempt` is `undefined` when the caller is an Instructor (not relevant to them) and `null` for a student who hasn't submitted yet.

### The exact state table — implement this precisely

| `test.started` | `test.revealed` | `myAttempt` | `questionUnits` | UI state |
|---|---|---|---|---|
| `false` | — | `null` | **`[]`** | Normal reading — rawText + dictionary only. No test section rendered at all. |
| `true` | `false` | `null` | Full list; `correctOption`/`explanation` both `null` on every item | Test-taking UI: render the MCQ form, let them pick an option per question |
| `true` | `false` | present, `score: null` | Full list; `correctOption`/`explanation` still `null` | "Submitted — waiting for your instructor to release results." Do not show a results screen; there isn't one yet. |
| `true` | `true` | present, `score: <number>` | Full list; `correctOption`/`explanation` populated | Full results screen: their score out of `myAttempt.totalQuestions`, and every question with the correct answer highlighted + its explanation |

**`myAttempt.score` being `null` does not mean "not submitted."** Check `myAttempt !== null` for submission status; check `test.revealed` separately for whether you're allowed to show the number. These are two different questions and your state logic needs to ask them separately, not conflate them into one boolean.

### Submitting

`POST /api/v1/notes/:id/test/submit`, body:
```json
{ "answers": [{ "questionUnitId": "...", "selectedOption": "A" }, ...] }
```
One call, every answer at once — there's no per-question submit endpoint, so collect all selections client-side first (e.g. in local component state as the student works through the list) and submit as a single batch when they hit a final "Submit test" action.

The response is deliberately uninformative: `{ "submitted": true }`. **Do not build a results screen off this response** — there isn't one, by design (see the PHASE_9 doc for why: revealing per-student the instant they finish would let a fast finisher leak the answer to someone still taking it). After a successful submit, re-fetch `GET /notes/:id` and drive your UI off the state table above — you'll land on the "waiting for reveal" row.

Failure modes to handle distinctly, not with a generic error toast:
- **`400 bad_request`, test not started** — shouldn't normally be reachable if your UI correctly hides the test form pre-`test.started`, but handle it gracefully regardless (e.g. someone with a stale cached page).
- **`409 conflict`, "You have already submitted this test."`** — a student hit submit twice, likely a slow connection double-tap. Treat as "you already took this," not an error — probably just re-fetch and show the waiting/results state.

### Instructor's two actions

Both are simple POSTs, no body:
- `POST /notes/:id/test/start` — idempotent, safe to call again. Show this button once a Note has generated content and isn't already started.
- `POST /notes/:id/test/done` — fails with `400` if the test was never started. Show this once `test.started` is `true` and hide/disable it once `test.revealed` is already `true`.

**There is no question-range/subset selection UI to build for the Instructor.** Every generated question on a Note is automatically the whole test — this was explicitly decided and simplified away during design. If any spec or mock you're working from shows an instructor picking "questions 1–10," that's stale — ignore it.

---

## 7. Assignments: the self-paced drill flow

**Structurally separate from Notes' test flow — don't reuse the component.** No Instructor involvement anywhere in this flow; it's entirely student-initiated and repeatable.

### `GET /api/v1/assignments/:id` response

```json
{
  "id": "...", "title": "...", "course": {...}, "generatedAt": "...",
  "sections": [{ "order", "heading", "content" }],
  "drills": { "completedCount": 2, "inProgressAttemptId": null, "bestScore": 6, "totalQuestions": 8 },
  "questionUnits": [ /* correctOption/explanation nullable — see below */ ]
}
```

Unlike Notes, `questionUnits` here is **always populated** — the question text and options are visible any time (they're study material, meant to be browsed). Only `correctOption`/`explanation` are nullable, and the rule for *that* is:

**Gated by the student's single most recent attempt, not "have they ever finished one."** If their latest attempt (in progress or just-started) isn't finished, both fields are `null` — even if a past drill was completed and revealed. The moment they start a fresh drill, any previously-visible answers go dark again until this new one finishes. Don't cache a "revealed" flag client-side across a `drill/start` call — always trust the fresh response.

### The flow

1. Show the Assignment's `sections` as reading material, as normal.
2. A "Start a drill" action → `POST /assignments/:id/drill/start`. Idempotent — if one's already running, you get that same attempt back (`{ attemptId, startedAt }`), not a duplicate. Always call this even if you think one might already be in progress; it's cheap.
3. Render the question list as an MCQ form (same visual pattern as a Note test, just a different data source and no "waiting" state — see below).
4. Collect answers locally; a "Finish drill" action submits them all at once: `POST /assignments/:id/drill/submit`, same body shape as the Note test submit.
5. **Unlike Notes, this response *is* your results screen — build directly off it, no re-fetch needed:**
   ```json
   {
     "finished": true, "score": 6, "totalQuestions": 8,
     "answers": [
       { "questionUnitId": "...", "selectedOption": "A", "correctOption": "B", "isCorrect": false, "explanation": "..." }
     ]
   }
   ```
6. Calling `drill/submit` with no attempt in progress returns `400` ("No drill in progress — call /drill/start first.") — always call `start` first in your flow, never assume state.
7. Let the student start another drill at any time — `drills.completedCount` and `drills.bestScore` are there to show a light progress summary ("Best: 6/8, 3 attempts") if you want one, entirely optional.

### No Instructor drill UI here at all

Nothing — no visibility, no controls, no data. If you're building the Instructor/"Administrator" section and find yourself wanting to show Assignment **drill** stats specifically, stop; that's still out of scope by design. **What changed (Phase 14):** this used to be true because Instructor had zero Assignment access of any kind — that's no longer the reason, since Instructor now reads Assignments and their submissions (see `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` §5/§6). Drills specifically still never surface to any staff role — they're self-paced practice, not a graded or staff-monitored signal, independent of the broader Assignment access change.

---

## 8. Instructor "my students" — `GET /api/v1/instructors/me/students`

> **⚠️ Response shape extended as of Phase 13 (v8), and scope note updated.** Two fields added: `lastStudiedChapterTitle` and `mostStudiedContent.chapterTitle` — per direct product decision, chapter-level detail is shown per-student here (not as a course-wide aggregate chart anywhere). This endpoint is still Notes-only, unchanged from when this doc was written — that part of the description below is still accurate.

```json
{
  "students": [
    {
      "id", "name", "studentCode",
      "totalStudySeconds", "lastStudiedAt", "mostStudiedContent", "weeklyActivityByDay",
      "engagement": "engaged" | "moderate" | "at-risk",
      "chapterTests": [
        { "noteId", "noteTitle", "chapterLabel", "score", "totalQuestions", "submittedAt" }
      ]
    }
  ]
}
```

This is computed across every course the Instructor is assigned to (via their own `me/courses`) — Notes only, no Assignment data blended in, matching the Instructor's actual access. `engagement` is the existing three-bucket classifier (engaged / moderate / at-risk, based on recency of study activity) — use it for whatever "who needs attention" view you build. `chapterTests[].revealed` tells you whether that specific score is official/student-visible yet or just an in-progress preview only the Instructor can see — **both are included now**, this endpoint doesn't hide unrevealed attempts. Treat `chapterTests` as an additive signal alongside `engagement`, not a replacement for it — a good dashboard shows both ("studying regularly" and "passing the tests" are different questions).

---

## 8a. Test progress dashboard (Instructor) — new, build this as its own page

`GET /instructors/me/students` (§8) is shaped per-**student** — right for "how is this one student doing across everything," wrong for "how did the whole class do on Chapter 3's test." For that, there's a dedicated endpoint, and it's genuinely a different page in your app, not a filtered view of the students list.

`GET /api/v1/instructors/notes/:id/results`:

```json
{
  "note": {
    "id": "...", "title": "...", "chapterLabel": "Chapter 3", "totalQuestions": 8,
    "test": { "started": true, "revealed": false }
  },
  "submitted": [
    { "studentId": "...", "studentName": "...", "studentCode": "...", "score": 6, "totalQuestions": 8, "submittedAt": "..." }
  ],
  "notYetSubmitted": [
    { "studentId": "...", "studentName": "...", "studentCode": "..." }
  ]
}
```

`submitted` is sorted highest score first; `notYetSubmitted` alphabetically — reasonable defaults, re-sort client-side if you want something else. **This is not gated by `test.revealed`** — the Instructor sees every submitted score the moment it comes in, on purpose, since the entire point of this page is helping them decide *when* to reveal (e.g. "8 of 10 have submitted, I'll wait for the last two" or "everyone's in, hit done now"). Don't build any "waiting to see scores" state into the Instructor's own view of this page — that concept only applies to students.

**How to reach this page:** from the course content list (`GET /instructors/courses/:courseId/content`, §3), each Note already carries `test: { started, revealed }` — put a "View results" link/button on any Note where `test.started` is `true`, leading here. This is also the natural place to put the `test/done` action itself (§6) — a "Release results to students" button right on this dashboard, next to the data that justifies clicking it, rather than only on the Note's own page.

---

## 9. Account management pages — build these, they didn't exist as backend capabilities until now

Two self-service pages are needed, and the backend support for them (password change) was added specifically because this rebuild needs it:

**Student account page:**
- Show name, student code, college (read-only — there's no self-service edit for these; a mistake means contacting the institution, not fixing it in-app).
- A "change password" form: current password + new password, `POST /students/me/password`. Handle `400 bad_request` ("Current password is incorrect") as a field-level error under the current-password input, not a generic toast.
- A "My Courses" view — ~~derived client-side per §5, not a separate endpoint~~ **use `GET /api/v1/students/me/courses` instead (Phase 10, added after this doc was written) — it's enrollment-scoped, which is more correct than deriving from the content list (a student can be enrolled with no published content yet).**

**Instructor ("Administrator") account page:**
- Show name and role (always "Instructor" here, but show it — reinforces the "Administrator" framing the Frontend uses).
- Same "change password" pattern, against `POST /instructors/me/password`.
- Show their assigned courses (`GET /instructors/me/courses`) — read-only; an Instructor never requests or manages their own course assignments, that's Admin-only in the console.

Neither page needs a "delete my account" option — that's Admin-only, console-side, intentionally not exposed to either self-service surface.

---

## 10. What not to build

A short list of things that would be reasonable guesses but are specifically wrong, based on real confusion during this rebuild:

- **Don't let a student see Note questions before a test starts**, styled as a "preview" or "practice" mode. There is no such thing for Notes. (Assignments have this; Notes don't. See §6/§7.)
- **Don't build a Note test results screen off the `test/submit` response.** It returns almost nothing on purpose. Re-fetch the Note and drive off `test.revealed`.
- **Don't build an Instructor question-range picker for tests.** Every question is always the whole test.
- ~~**Don't give Instructors any Assignment-related screen, data, or affordance. Zero access, by design, unchanged across every phase of this app.**~~ **This is now WRONG as of Phase 14 (v8) — the opposite is true.** Instructor now creates, generates, publishes, and reads Assignments and their submissions, same as Notes. The one piece of this that's still correct: don't give Instructors any *drill* data (see §7's updated notice) — that's a narrower, still-standing exception, not the old blanket rule.
- **Don't build a free-text "search all students" picker anywhere in the Frontend if you ever touch a sending-adjacent feature.** (This one's console-side, not yours, but worth knowing why: an earlier version of that exact pattern had no College scoping at all and caused a real cross-college access leak — see `docs/phases/PHASE_9.md`'s amendment section. If a future Frontend feature ever needs to list/select students, scope it the same way the fixed console version does — grouped by an actual eligible set, never an unrestricted search.)
- **Don't treat `correctOption`/`explanation` being `null` as an error state to handle defensively.** It's an expected, common, and meaningful part of the data — build your question-rendering component to take a `revealed: boolean` (or equivalent) as a first-class prop from the start, not bolt it on after the fact.