# Frontend Handoff — Phase 9 Changes

> **⚠️ Superseded as the primary reference — twice over now.** `docs/FRONTEND_BUILD_GUIDE.md` superseded this doc originally; **`docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` now supersedes that one too** (Phase 10-17's Semester/monetization/publishing/submission rebuild). Read the Phase 10+ doc first. This doc is kept as historical context for what specifically changed *in* Phase 9, and one part of it below was actively wrong and has been corrected inline: the original version of this doc said Note questions were visible before the instructor started the test, with only `correctOption`/`explanation` withheld. **That was wrong** — the entire question set is hidden until `test.started`. See the corrected table below and §2.2 of the build guide.

**For:** the engineer rebuilding the Frontend project (Student pages + the Instructor "Administrator" section)
**Why this exists:** the Frontend was already built against the pre-Phase-9 API. Phase 9 changed the shape of every note/assignment response and added new endpoints. This doc is a migration guide — what broke, what's new, and what UI flow each new endpoint implies. Read `BACKEND_BUILD_PLAN.md` §4a first for the two-sentence version of *why* these changes exist; this doc is the *what* and *how to consume it*.

Nothing about auth, CORS, error shape (`{ error: { code, message } }`), or the routes not mentioned here has changed — this is scoped strictly to what Phase 9 touched.

---

## 1. The breaking change: `QuestionUnit` is no longer free-text

Every place your app currently renders a question/answer pair — Note detail, Assignment detail — needs to change from "show the answer as text" to "render four options and let the user pick one."

**Old shape** (per question unit):
```json
{ "id": "...", "order": 0, "question": "...", "answer": "...", "explanation": "...", "example": "...", "isTable": false, "dictionaryEntries": [...] }
```

**New shape:**
```json
{
  "id": "...",
  "order": 0,
  "question": "...",
  "optionA": "...",
  "optionB": "...",
  "optionC": "...",
  "optionD": "...",
  "correctOption": "B",
  "explanation": "...",
  "isTable": false,
  "dictionaryEntries": [{ "term": "...", "definition": "...", "example": "..." }]
}
```

Two things to notice:
- `answer` and top-level `example` are gone. Don't look for them anymore.
- `dictionaryEntries[].example` is new — each dictionary term can now come with an illustrative example. Render it if present (it's nullable).
- **`correctOption` and `explanation` can be `null`** on both Note and Assignment question units, even though they exist as fields. This isn't missing data — it means "not revealed to you yet." See §2 and §3 for exactly when. Your UI needs a state for "options shown, no correct answer highlighted yet" as a first-class case, not an error case.

## 2. Notes: chapter tests (instructor-controlled)

### The new fields on a Note

```json
{
  "id": "...",
  "title": "...",
  "chapterLabel": "Chapter 3",
  "rawText": "...",
  "course": { "id": "...", "name": "...", "courseCode": "..." },
  "generatedAt": "...",
  "test": {
    "started": true,
    "revealed": false,
    "myAttempt": {
      "submittedAt": "2026-08-25T10:00:00.000Z",
      "score": null,
      "totalQuestions": 8
    }
  },
  "questionUnits": [ ... ]
}
```

`chapterLabel` is new — display it wherever you show the Note's title (it's how instructors and students will refer to "this week's chapter"). It's optional; a Note might not have one.

`test` is new. `myAttempt` is only present when the caller is a Student (it's `undefined` for an Instructor's own request — Instructors always see the full bundle regardless of test state, since they're not the one being tested). Read it like this:

| `test.started` | `test.revealed` | `myAttempt` | `questionUnits` | What to show the student |
|---|---|---|---|---|
| `false` | — | `null` | **`[]` — empty, not shown at all** | Normal study mode (rawText + dictionary only) — no test UI, no question list |
| `true` | `false` | `null` | Full list, `correctOption`/`explanation` both `null` | "Test is open — take it now" call to action |
| `true` | `false` | present, `score: null` | Full list, `correctOption`/`explanation` both `null` | "You've submitted — waiting for your instructor to release results" |
| `true` | `true` | present, `score: <number>` | Full list, `correctOption`/`explanation` populated | Full results: score, and every question's correct answer + explanation |

**Corrected from an earlier version of this doc:** the question list itself — not just `correctOption`/`explanation` — is empty until `test.started` is `true`. Don't render "questions with no answer shown yet" as a pre-test study mode; there's no question list to render at all until the instructor starts the test. `dictionaryEntries` are a separate concern and remain available whenever the Note is otherwise readable — dictionary terms aren't test content.

**Important:** `myAttempt.score` is `null` even though the attempt exists, until `test.revealed` is `true`. Don't treat a `null` score as "not submitted" — check `myAttempt !== null` for submission status and `test.revealed` for whether you can show the number.

### New endpoints — who calls what

| Endpoint | Caller | What it does |
|---|---|---|
| `POST /api/v1/notes/:id/test/start` | **Instructor only** | Opens the chapter test for submissions. Idempotent — safe to call again. |
| `POST /api/v1/notes/:id/test/done` | **Instructor only** | Reveals results for everyone who attempted. Fails with `bad_request` if the test was never started. |
| `POST /api/v1/notes/:id/test/submit` | **Student only** | Body: `{ "answers": [{ "questionUnitId": "...", "selectedOption": "A" }, ...] }`. One shot — include every answer in a single call. |

**The submit response is deliberately uninformative:**
```json
{ "submitted": true }
```
No score, no correctness, nothing. The student finds out how they did later, from `GET /notes/:id`, once `test.revealed` flips to `true`. Don't build a "results" screen off the submit response — there isn't one. Build it off re-fetching the Note.

**Submit is one-shot per student.** A second call returns `409 conflict` with `"You have already submitted this test."` — treat that as "you already took this" in your UI, not a generic error toast, since a student might reasonably hit submit twice on a slow connection.

**Submit requires the test to be started.** Calling it before an Instructor has called `test/start` returns `400 bad_request`.

### Instructor UI implications

Your Instructor ("Administrator") section needs two new buttons somewhere on a Note's detail view — most naturally next to wherever you already show a Note's title/chapter:

- **"Start test"** → `POST /notes/:id/test/start`. Disable/hide once `test.started` is already `true`.
- **"Release results"** → `POST /notes/:id/test/done`. Only show once `test.started` is `true`; disable/hide once `test.revealed` is already `true`.

Both are scoped server-side to courses the Instructor is actually assigned to (`InstructorCourse`) — a request against a Note outside their courses returns `no_access`. You don't need to duplicate that check client-side, but don't render the buttons for content you're not already showing the Instructor in the first place.

There is **no range/subset selection UI to build**. Every generated question on the Note is the test, always — this was explicitly decided during the backend design discussion (an earlier draft considered "instructor picks questions 1–10," and it was cut). If your existing mocks/designs assumed a curation step, drop it.

## 3. Assignments: self-paced drills (student-controlled)

This is a **completely different mechanism from Notes' tests** — no instructor involvement anywhere. Don't reuse the Note test-taking component for Assignments; build a separate one, even though the visual pattern (pick an option per question, then find out if you were right) looks similar.

### The new fields on an Assignment

```json
{
  "id": "...",
  "title": "...",
  "course": { "id": "...", "name": "...", "courseCode": "..." },
  "generatedAt": "...",
  "sections": [ ... ],
  "drills": {
    "completedCount": 2,
    "inProgressAttemptId": null,
    "bestScore": 6,
    "totalQuestions": 8
  },
  "questionUnits": [ ... ]
}
```

`correctOption`/`explanation` on each question unit follow the same nullable pattern as Notes, but the trigger is different: they're populated only if the student's **most recent** drill attempt is finished. Practically:

| State | What `correctOption`/`explanation` look like |
|---|---|
| Never drilled | `null` |
| Currently mid-drill (`drills.inProgressAttemptId` is set) | `null` — even if a past drill was completed |
| Most recently finished a drill | populated |

**This re-hiding on a fresh drill is the important, easy-to-get-wrong part.** If a student has answers revealed, finished, closed the app, and comes back later and taps "drill again," the reveal disappears again the moment `drill/start` succeeds — before they've answered a single new question. Your UI should reflect that immediately (hide the correct-answer styling) once `drill/start` returns, not wait for a submit.

### New endpoints

| Endpoint | Caller | What it does |
|---|---|---|
| `POST /api/v1/assignments/:id/drill/start` | Student only | Starts (or resumes) a drill. Idempotent — if one's already in progress, returns that same attempt instead of creating a new one. Response: `{ "attemptId": "...", "startedAt": "..." }`. |
| `POST /api/v1/assignments/:id/drill/submit` | Student only | Body: `{ "answers": [{ "questionUnitId": "...", "selectedOption": "A" }, ...] }`. Finishes the current in-progress attempt. |

**Unlike Notes, `drill/submit`'s response *is* the results screen** — build the results UI directly from this response, don't re-fetch:
```json
{
  "finished": true,
  "score": 6,
  "totalQuestions": 8,
  "answers": [
    {
      "questionUnitId": "...",
      "selectedOption": "A",
      "correctOption": "B",
      "isCorrect": false,
      "explanation": "..."
    }
  ]
}
```

There's no staff action to wait for. The moment the drill ends, the reveal is right there in the response.

**Calling `drill/submit` without an in-progress attempt** (i.e. you never called `drill/start`, or the previous one already finished) returns `400 bad_request` with `"No drill in progress — call /drill/start first."` — always call `start` first in your drill-taking flow, even if you think one might already be running; it's cheap and idempotent.

### Suggested Student UI flow for an Assignment

1. Show the Assignment's sections/content as before.
2. A "Start a drill" / "Practice this assignment" button → `drill/start`.
3. Render each question unit as multiple choice, letting the student pick an answer per question, locally in your UI state — nothing is sent to the server per-question.
4. A "Finish drill" button collects everything picked so far and calls `drill/submit` once, with the full answer set.
5. Render the results screen directly from that response.
6. If `drills.completedCount > 0`, consider showing a "best score: X/Y" summary somewhere, and let the student start another drill any time — it's unlimited.

### No Instructor UI needed here at all

Instructor has zero Assignment access (unchanged from before Phase 9 — this was never in scope). Nothing about drills should appear anywhere in the Instructor section.

## 4. List/summary endpoints — lighter status now included

If your app has a "my content" home screen (Student) pulling from `GET /api/v1/students/me/content`, each item now carries a status summary so you can show what needs attention without opening every item:

```json
{
  "notes": [
    {
      "id": "...", "title": "...", "course": {...}, "generated": true, "openedAt": "...",
      "test": { "started": true, "revealed": false, "submitted": false, "score": null }
    }
  ],
  "assignments": [
    {
      "id": "...", "title": "...", "course": {...}, "generated": true, "openedAt": "...",
      "drill": { "inProgress": true }
    }
  ]
}
```

Good for badges like "Test open — take it" on a Note card, or "Drill in progress — resume" on an Assignment card, without a per-item fetch.

If your Instructor section has a course content list pulling from `GET /api/v1/instructors/courses/:courseId/content`, each Note now includes `chapterLabel` and a `test: { started, revealed }` summary — enough to decide whether to show "Start test" or "Release results" in a list view without opening each Note individually.

If your Instructor "my students" view pulls from `GET /api/v1/instructors/me/students`, each student now also carries a `chapterTests` array — one entry per **revealed** chapter-test attempt (`{ noteId, noteTitle, chapterLabel, score, totalQuestions, submittedAt }`, sorted oldest first). This is additive to the existing engagement fields (`totalStudySeconds`, `engagement`, etc.) — nothing there changed shape. Use it for a per-chapter score trend view alongside the existing engagement dashboard, not instead of it.

## 5. Upload — Instructor Note upload gained one optional field

`POST /api/v1/instructors/notes` (multipart form) now accepts an optional `chapterLabel` field alongside the existing `courseId`/`title`/content fields. Add a text input for it in your upload form if you want Instructors to be able to set it — it's not required, and omitting it just leaves the Note without a chapter label (fine, same as before).

## 6. Quick checklist for the rebuild

- [ ] Replace every "render `question`/`answer`" component with "render `question` + 4 options (`optionA`–`optionD`), highlight `correctOption` only when non-null"
- [ ] For Notes specifically: render an empty/no-test state when `questionUnits` is `[]` and `test.started` is `false` — this is normal, not an error, and is different from the `null`-correctOption state (which only happens once `test.started` is `true` but `test.revealed` is `false`)
- [ ] For Assignments: `questionUnits` is always populated regardless of drill state — only `correctOption`/`explanation` go `null`, per the most-recent-attempt rule in §3
- [ ] Build a Note test-taking flow: start-detection → MCQ form → single `test/submit` call → "waiting for reveal" state → re-fetch-based results
- [ ] Build a **separate** Assignment drill flow: `drill/start` → MCQ form → single `drill/submit` call → results rendered directly from that response, repeatable
- [ ] Add "Start test" / "Release results" buttons to the Instructor Note view, gated on `test.started`/`test.revealed`
- [ ] Do **not** add any staff-facing controls to the Assignment drill flow
- [ ] Update any TypeScript types/interfaces for `QuestionUnit`, `Note`, `Assignment` to match the shapes in this doc
- [ ] Add `chapterLabel` display (Note) and optional input (Instructor upload form)
- [ ] Update dictionary entry rendering to include the new optional `example` field

## Backend contact points if something doesn't match this doc

The authoritative source for exact request/response shapes is the route handler source itself, not this doc — if anything here seems to disagree with what you observe from the running API, trust the API and flag it, since this was written by hand alongside the backend code, not generated from it. Relevant files: `src/routes/api/v1/notes/[id]/**`, `src/routes/api/v1/assignments/[id]/**`, `src/routes/api/v1/students/me/content/+server.ts`, `src/routes/api/v1/instructors/**`. Full backend-side rationale is in `docs/phases/PHASE_9.md`.
