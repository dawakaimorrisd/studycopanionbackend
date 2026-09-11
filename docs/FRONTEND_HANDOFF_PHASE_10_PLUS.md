# Study Companion — Frontend Handoff (Phase 10–17), v4

**For:** the frontend engineer continuing work against this backend.
**Supersedes:** `docs/FRONTEND_BUILD_GUIDE.md` and `docs/FRONTEND_HANDOFF_PHASE_9.md` wherever they conflict with this doc — those predate the Semester/payment/chapter/submission rebuild described here. This doc covers what's new or changed from Phase 9. Anything not mentioned here (student/instructor login mechanics beyond what's shown, the console, file upload constraints, rate limiting) is unchanged from those older docs.
**v4 note (the biggest change in this whole doc's history):** Assignment and Submission are now one entity, created entirely by a student uploading their own homework — there is no staff-authored prompt anymore, for Instructor OR Admin/Moderator. The two endpoints this blocked (`POST /students/me/courses/:courseId/assignments`, `GET /students/me/courses/:courseId/eligible-group-members`) now exist — see §5. `publishedAt` is gone from Assignment entirely, confirming your own open question. Everything else you already built against (generate/distribute/received-distributions/drill start-submit) is unchanged in contract, per your v3 handoff's own confirmation.
**v3 note:** this version reconciles against the actual Frontend implementation as reported in `BACKEND_HANDOFF(2).md` — v2 briefly described a batch/sync study-tracking redesign that didn't match what was actually built (the real-time Start/End Study pair was kept); that's corrected in §7.

**Route source of truth:** the route handler files themselves, under `src/routes/api/v1/**`. If anything here disagrees with what you observe from the running API, trust the API and flag it back to backend — this doc is written by hand, not generated from the code.

---

## 0. The one concept that changed everything: Semester

There is always exactly one **active semester**. Every piece of academic data — enrollment, payment, content, study activity — is scoped to it. You never pick a semester in the frontend; the backend always resolves "the active one" server-side. If a request depends on the active semester and none is configured, you'll get a `500` — that's a real backend misconfiguration (an Admin hasn't activated one yet), not something your UI needs to handle gracefully beyond a generic error state.

**What this means for you concretely:**
- A student's course list, content list, and access status can all look completely different after an Admin activates a new semester — with no action from the student. Don't cache semester-scoped data across app sessions without checking the `semester.id` you get back still matches.
- Every relevant response now includes a `semester: { id, name }` object so you can display "for {semester.name}" and detect when it's changed.

---

## 1. Auth — mostly unchanged, one new endpoint each side

`POST /students/signup`, `POST /students/login`, `POST /instructors/login` are all **unchanged** in shape. Bearer token via `Authorization: Bearer <token>` header, as before.

**New: "who am I" endpoints.** Call these on app load / after auth, before deciding what screen to show:

```
GET /api/v1/students/me
→ { student: { id, name, studentCode }, semester: { id, name }, enrolled: boolean, paid: boolean }

GET /api/v1/instructors/me
→ { staff: { id, name, role }, semester: { id, name }, paid: boolean }
```

`paid: false` is the trigger for a "your semester access isn't active yet" screen — see §3.

`GET /api/v1/colleges` is unchanged (public, unauthenticated, for the signup form's college picker).

---

## 2. Courses — enrollment is now real, and separate from eligibility

Old model: a student saw everything in their college. **That's gone.** A student now needs to be specifically enrolled in a course (by Admin/Moderator, from the console — there is no student-facing "join a course" action) for the active semester.

```
GET /api/v1/students/me/courses
→ { semester: { id, name }, courses: [{ id, name, courseCode }] }

GET /api/v1/instructors/me/courses
→ { semester: { id, name }, courses: [{ id, name, courseCode }] }
```

Both return **enrollment/assignment only** — not eligibility. A student can be enrolled here and still see zero content if they haven't paid (§3). Don't treat a non-empty course list as "this student can see stuff" — always check `paid` from `GET /students/me` too.

---

## 3. Payment / semester access — build the "unpaid" screen

There is no in-app payment flow. Payment is entered manually by Admin/Moderator from the console. Your job is purely to **detect and communicate** the unpaid state:

- `GET /students/me` / `GET /instructors/me` → `paid: boolean` (see §1)
- If `paid: false`: show a "Your access for {semester.name} hasn't been activated yet — contact your administrator" screen. Don't attempt to show course/content lists behind this state; they'll come back empty anyway (see §4), so surfacing the *reason* clearly is the actual UX job here.
- There is no client-triggerable "request payment" or "check payment status" polling endpoint — the student/instructor just needs to log out and back in (or you re-call `/me`) after being told they've been activated.

---

## 4. Notes — Instructor now fully self-serve (this is the big change from Phase 9)

Old model: Instructor uploads, only Admin/Moderator can generate or publish, from the console. **That's gone too** — Instructor now has the complete flow themselves:

```
POST /api/v1/instructors/notes                  (multipart/form-data)
  fields: courseId (required), title?, chapterLabel?, chapterId?,
          pastedText OR file (PDF/DOCX)
→ { id } (201)

POST /api/v1/instructors/notes/:id/generate     (no body)
→ { generated: true, generatedAt } | 400 with the generation error message

POST /api/v1/instructors/notes/:id/publish      (no body)
→ { published: true }   — 400 if not generated yet
```

Build the Instructor's note screen as: upload → [Generate Study Materials] → review → [Save for Students]. No recipient picker anywhere — publishing makes it visible to every paid+enrolled student in that course/semester, automatically. There's no unpublish button exposed to Instructor via API (Admin/Moderator can unpublish from console if needed).

**Listing:**
```
GET /api/v1/instructors/courses/:courseId/content
→ { notes: [{ id, title, chapterLabel, createdAt, generatedAt, publishedAt, uploadedByStaffId, test: { started, revealed } }] }
```

**Reading one (works for Instructor, Admin, Moderator, and eligible Student — same endpoint, response shape differs by role):**
```
GET /api/v1/notes/:id
```
This endpoint's shape is otherwise unchanged from Phase 9 — see the older handoff doc for the full field list (question reveal gating by `testStartedAt`/`testRevealedAt`, dictionary always visible, etc.). What's new: a staff caller now needs `canManageCourse` to pass (Instructor assigned to the course **and** currently paid) or they get `403 no_access`.

**Note: `notes/:id/open`/`assignments/:id/open` are removed entirely** (not deprecated-but-kept — actually gone). See §8 for what replaced the "opened" signal.

---

## 5. Assignment — v4: student-originated, no more staff prompt (THE big change since v3)

**Confirmed and built exactly as your v3 handoff specced it.** Assignment and Submission are now one entity. Nobody pre-creates it — Instructor lost create/generate/publish entirely (removed, not deprecated); Admin/Moderator never had submission-level creation either. **A student's own upload creates the whole record.**

**The two endpoints you were blocked on now exist:**

```
POST /api/v1/students/me/courses/:courseId/assignments     (multipart/form-data)
  fields: title?, type (required: "INDIVIDUAL" | "GROUP"),
          groupName? (GROUP only), memberStudentIds? (GROUP only, repeated),
          file (required)
→ 201 { assignmentId, submissionId, title, type, pdfUrl, pdfConversionError }
```
`assignmentId` and `submissionId` are the same value, both included so none of your existing `createMyAssignment` call sites that expect a `submissionId` need to change. Same extraction + PDF pipeline as everything else that handles a file upload — text extracted for generation, a PDF produced either way (passed through if already a PDF, rendered from text otherwise — see §5's honest-limitation note below, unchanged).

```
GET /api/v1/students/me/courses/:courseId/eligible-group-members
→ { students: [{ id, name, studentCode }] }   — paid+enrolled classmates, excluding self
```
Same shape as the old assignment-scoped version — just course-scoped now, since there's no assignment id yet at the point a student is picking group members. **The old assignment-scoped `GET /students/me/assignments/:id/eligible-group-members` is removed** — switch to this one.

**Everything downstream works exactly as before, unchanged in shape** — you had this right in your handoff. `GET /students/me/assignments/:id/submission`, `POST /submissions/:id/generate`, `GET /submissions/:id/eligible-recipients`, `POST /submissions/:id/distribute`, `GET /received-distributions`, and the distribution drill start/submit pair are all still there, all still keyed on the assignment/submission id (now the same id, one record). No changes needed on your end for any of those.

**Reading an Assignment:**
```
GET /api/v1/assignments/:id
→ {
    id, title, type, groupName, course,
    submittedBy: { id, name, studentCode },
    members: [{ id, name, studentCode }],
    submittedAt, generatedAt, generationError,
    pdfUrl, pdfConversionError,
    questionUnits: [{ id, order, question, optionA-D, correctOption, explanation, isTable, dictionaryEntries }]
  }
```
**`publishedAt` is gone from the response — confirmed dropped, per your own open question.** There's no release step anymore; a submission is visible to whoever can see it (submitter, tagged members, staff) the instant it's created. `sections` is also gone — that was a staff-authored-content concept (splitting a prompt into headed sections) that doesn't apply to a student's own uploaded work.

**Access to this endpoint:** the submitter, a tagged GROUP member, or staff with `canManageCourse`. Anyone else gets `no_access` — reading a classmate's assignment directly isn't possible; only via an explicit distribution they were sent.

**`questionUnits` is now ALWAYS fully revealed — no more staff-vs-student shape split.** There's no one else grading or gating your own homework's self-check questions. (A distribution *recipient* is a different, still-gated case — see §6.)

**Instructor's assignment list (still exists, now the ONLY list — no more separate "submissions" sub-endpoint):**
```
GET /api/v1/instructors/courses/:courseId/assignments
→ {
    assignments: [{
      id, title, type, groupName,
      submittedBy: { id, name, studentCode },
      members: [{ id, name, studentCode }],
      submittedAt, generatedAt, pdfUrl, pdfConversionError,
      questionUnitCount
    }]
  }
```
Read-only, as confirmed in your §3. **Open `pdfUrl`.** There is no `fileUrl` in this response at all anymore (the field still exists in the DB for provenance, just isn't surfaced here) — if anything still references it, drop it.

**Honest limitation on the PDF, unchanged from before:** rendered from extracted text when the source was a DOCX or pasted text — not a pixel-perfect copy of an original document (no tables/images/complex formatting). If uploaded as a PDF to begin with, `pdfUrl` is that exact file, unchanged, uncompressed.

**Storage/CORS/compression notes — unchanged from before, still relevant, see your own §2.1/§2.2:** dual-provider storage (`STORAGE_PROVIDER`, local disk dev default, Cloudinary required for real deployment — local disk is very likely what caused the original 404, not a routing bug); Cloudinary CORS not independently verified from this build environment; `pdf-lib`'s `useObjectStreams` applied to rendered PDFs, real Ghostscript-level compression not implemented (system binary, not installable/verifiable here), already-a-PDF uploads pass through uncompressed.

---

## 6. Assignment study distribution — unchanged from your v3, confirmed working against the new model

Everything here matches what you already built and confirmed aligned — restated briefly since the underlying model changed even though the contract didn't:

```
POST /api/v1/students/me/submissions/:id/generate        (submitter only, GROUP only)
→ { generated: true, generatedAt, questionUnits: [...] }   — full, ungated
  | 400 if not a group assignment, or text couldn't be extracted

GET /api/v1/students/me/submissions/:id/eligible-recipients   (submitter only, GROUP only)
→ { students: [{ id, name, studentCode }] } | 400 if not a group assignment

POST /api/v1/students/me/submissions/:id/distribute       (submitter only, GROUP only)
  body: { recipientStudentIds: string[] }
→ { id, sentCount, skippedCount } (201) | 400 if not a group assignment
```

```
GET /api/v1/students/me/received-distributions
→ {
    distributions: [{
      distributionId, receivedAt,
      sentBy: { id, name, studentCode },
      assignment: { id, title, groupName, fileName, pdfUrl, pdfConversionError, course },
      drills: { completedCount, inProgressAttemptId, bestScore, totalQuestions },
      questionUnits: [{ id, order, question, optionA-D, correctOption: string | null, explanation: string | null, isTable, dictionaryEntries }]
    }]
  }
```
One field rename to note: the per-distribution object is now `assignment` (was `submission` in an earlier version of this doc) — same content, just matching the unified model's naming. `correctOption`/`explanation` stay `null` until that distribution's most recent drill attempt is finished — real gating, matching `DistributionDrillPanel`'s already-built calls:

```
POST /api/v1/students/me/distributions/:id/drill/start     (`:id` = distributionId)
→ { attemptId, startedAt }

POST /api/v1/students/me/distributions/:id/drill/submit
  body: { answers: [{ questionUnitId, selectedOption }] }
→ { finished: true, score, totalQuestions, answers: [{ questionUnitId, selectedOption, correctOption, isCorrect, explanation }] }
```

---

## 7. Study sessions & analytics — Start/End Study is back (please read even if you built the activity-based/sync version)

**Correction, confirmed against your actual implementation:** an earlier version of this doc briefly replaced Start/End Study with a batch "sync" model. That's reverted. **You kept the real-time `POST /study-sessions/start` / `POST /study-sessions/:id/end` pair for the online case** — the activity-based behavior (pause on ~45s inactivity or tab/app backgrounding, resume on next interaction) is implemented by calling this pair *more often*, in short bursts that match real contiguous engagement, not by changing the endpoint contract. That's confirmed correct and needs nothing new from backend for the online case.

```
POST /api/v1/study-sessions/start
  body: { noteId }
→ { sessionId, startedAt } (201)

POST /api/v1/study-sessions/:sessionId/end     (no body)
→ { sessionId, durationSeconds, endedAt }
```
Duration is computed **server-side** from `startedAt` to when `end` arrives. Idempotent — calling `end` twice on the same session returns the already-recorded duration rather than erroring, which matters now that this fires far more often than once per page visit.

**NEW — for the offline case only, since `start` can't reach the server when there's no connection:**
```
POST /api/v1/study-sessions/backfill
  body: { noteId, seconds, occurredAt: ISO8601 }
→ { durationSeconds } (201)
```
`seconds` is a single client-accumulated active-time count for one contiguous offline interval. `occurredAt` should be roughly "when this interval ended" (used to place the entry in time — not used to compute anything). This is the one place `durationSeconds` is genuinely client-computed rather than server-timed — an accepted, unavoidable tradeoff for an inherently-offline scenario (there's no live session for the server to time by definition). It's clamped server-side at 6 hours per entry regardless of what's reported. **Not deduplicated server-side** — if you retry a queued entry after a flaky reconnect, only remove it from your local queue after a confirmed `201`, never before, since a retry-before-confirmation could double-count.

**NOTES ONLY** for all three of these endpoints — Assignments are read as PDF (§5) and don't get this kind of engagement tracking at all; don't call `start`/`end`/`backfill` for an Assignment's PDF view.

**New student dashboard endpoint:**
```
GET /api/v1/students/me/study-summary
→ { semester: { id, name }, thisWeekSeconds, coursesStudiedThisWeek, mostStudiedCourse: {...} | null, currentStreakDays }
```

**Instructor analytics — course-level only, not chapter-level.** A course's chapters *are* its notes, so chapter-level time tracking doesn't add a meaningful signal beyond note-level, and chapter *accuracy* is already covered by test/drill scores. No "most/least studied chapter" chart — it's intentionally not in this API:
```
GET /api/v1/instructors/courses/:courseId/analytics?period=today|week|month   (default: week)
→ { semester, period, totalStudySeconds, activeStudentCount }

GET /api/v1/instructors/me/analytics?period=today|week|month
→ { semester, period, courses: [{ courseId, courseName, totalStudySeconds, activeStudentCount }] }
```
No custom date-range support yet (`period` only accepts the three named values).

**Chapter context IS still surfaced, just per-student, not aggregated:**
```
GET /api/v1/instructors/me/students
→ {
    students: [{
      id, name, studentCode, totalStudySeconds, weeklyActivityByDay, engagement,
      lastStudiedAt, lastStudiedChapterTitle,
      mostStudiedContent: { sourceType, id, title, chapterTitle, seconds } | null,
      chapterTests: [...]
    }]
  }
```

**`GET /students/me/content` — assignments now include `pdfUrl` too:**
```
GET /api/v1/students/me/content
→ {
    semester: { id, name },
    paid: boolean,
    notes: [{ id, title, course, generated, test: {...} }],
    assignments: [{ id, title, type, course, generated, pdfUrl, drill: { inProgress } }]
  }
```
If `paid: false`, both arrays are always empty.

---

## 8. "Has this student opened this note?" — answered by Start/End Study existing at all

There's no separate "opened" field or endpoint. `POST /notes/:id/open` and `POST /assignments/:id/open` are **removed entirely** — not deprecated, not kept as a no-op, gone. Whether a student has engaged with a note is answerable from whether any `StudySession` row exists for it, but there's no dedicated GET exposing that as a per-note boolean today. If you need a "Continue" vs "Start" affordance on a note card, flag it back — the data exists in principle, just not surfaced via any current endpoint.

---

## 9. Error shape (unchanged, restated for reference)

Every error response:
```
{ "error": { "code": "...", "message": "..." } }
```
Branch on `code`, not `message` text. Common codes: `not_authenticated` (401), `not_a_student`/`not_an_instructor` (403), `no_access` (403 — covers "not eligible," "not paid," "not enrolled," "not assigned," "not the submitter," "not a recipient of this distribution" — message differs, code doesn't), `not_found` (404), `bad_request` (400 — validation, or a business-rule rejection like "generate before publishing," or "not a group submission"), `conflict` (409), `rate_limited` (429).

---

## 10. Quick reference — everything new/changed since Phase 9

| Endpoint | Status |
|---|---|
| `GET /students/me` | new |
| `GET /instructors/me` | new |
| `GET /students/me/courses` | new |
| `GET /instructors/me/courses` | changed (semester-scoped) |
| `GET /students/me/content` | changed (`paid` flag; assignments now include `pdfUrl`) |
| `GET /instructors/courses/:id/content` | changed (gated on paid access too) |
| `GET /instructors/courses/:id/assignments` | changed — now the ONLY assignment list (no more separate submissions endpoint); read-only, student-submitted homework |
| `POST /instructors/assignments`, `.../generate`, `.../publish` | **REMOVED** — Instructor never creates/generates/publishes an Assignment |
| `POST /students/me/courses/:courseId/assignments` | **new (v4)** — THE creation endpoint; a student's own upload creates the whole Assignment record |
| `GET /students/me/courses/:courseId/eligible-group-members` | **new (v4)** — course-scoped; replaces the assignment-scoped version below |
| `GET /students/me/assignments/:id/eligible-group-members` | **REMOVED (v4)** — use the course-scoped version above |
| `GET /instructors/courses/:id/assignments/:id/submissions` | **REMOVED (v4)** — collapsed into `GET /instructors/courses/:id/assignments` above |
| `GET /assignments/:id` | changed (v4) — no more staff/student shape split, always fully revealed; `publishedAt`/`sections` removed; `submittedBy`/`members`/`groupName` added |
| `GET /notes/:id` | changed — `createdAt`/`publishedAt` added |
| `POST /students/me/assignments/:id/submission` | **REMOVED (v4)** — replaced by the course-scoped creation endpoint above |
| `GET /students/me/assignments/:id/submission` | unchanged in contract — "did I already submit this," now reading the unified model |
| `POST /students/me/submissions/:id/generate` | unchanged in contract, **GROUP-only** — full `questionUnits` in response |
| `GET /students/me/submissions/:id/eligible-recipients` | unchanged in contract, **GROUP-only** |
| `POST /students/me/submissions/:id/distribute` | unchanged in contract, **GROUP-only** |
| `GET /students/me/received-distributions` | changed (v4) — per-distribution object renamed `submission` → `assignment`; gating unchanged (`correctOption`/`explanation` null until drilled) |
| `POST /students/me/distributions/:id/drill/start`, `.../submit` | unchanged in contract |
| `GET /students/me/study-summary` | new |
| `GET /instructors/courses/:id/analytics`, `GET /instructors/me/analytics` | new — course-level only, no chapter breakdown |
| `GET /instructors/me/students` | changed (adds `lastStudiedChapterTitle`, `mostStudiedContent.chapterTitle`) |
| `POST /study-sessions/start`, `POST /study-sessions/:id/end` | unchanged in contract — just called more often now (activity-based bursts), Notes only |
| `POST /study-sessions/backfill` | new — offline-only, client-computed duration, Notes only |
| `POST /notes/:id/open`, `POST /assignments/:id/open` | **removed entirely** |
