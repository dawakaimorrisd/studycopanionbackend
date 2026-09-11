# Phase 6 — Public REST API for the Frontend App

> **Amended after initial build:** Instructor's Assignment access (both upload and read) was removed entirely — Instructor is Notes-only from here on. Assignments stay Admin/Moderator-only, end to end, via the console. The sections below reflect the corrected, current state.

> **Reversed again in Phase 14 (v8):** the amendment above was itself superseded — Instructor now has full create/generate/publish/read parity with Notes for Assignments too, plus submission-reading access, per `plans.txt` §10/§11/§14/§25/§30's explicit redesign. See `PHASE_10_PLUS_BUILD_PLAN.md`'s Phase 14 and `BACKEND_BUILD_PLAN.md` §4b. The `NoteAccess`/`AssignmentAccess`-based "my students" and "sent content" descriptions below are also superseded as of Phase 12 — see `docs/phases/PHASE_5.md`'s notice. This doc is kept as a historical record of Phase 6 as originally (and then once-amended) built; don't treat it as current behavior.

## What this phase built

Everything under `src/routes/api/v1/**`. This is the entire surface the separate Frontend project talks to — it has no direct database access, per the architecture in the build plan.

**Student endpoints:**
- `POST /students/signup` — name, studentCode, password, collegeId. One-time, fully manual (no pre-provisioned roster — see build plan §9). Returns a bearer token immediately.
- `POST /students/login` — studentCode + password. Generic error either way, same reasoning as the console login.
- `GET /students/me/content` — everything explicitly sent to the signed-in student (list-level: title, course, generated status, opened status). This is what "invisible until sent" looks like from the API side.
- `GET /notes/:id`, `GET /assignments/:id` — full content (rawText, question units, dictionary). Two valid callers with different rules: a Student must hold an access grant; an Instructor's request is checked against `InstructorCourse` for that content's course. Admin/Moderator get an explicit `not_an_instructor` error here — they use the console, never this API.
- `POST /notes/:id/open`, `POST /assignments/:id/open` — pulled forward into Phase 5, unchanged here.
- `POST /study-sessions` — logs a `StudySession` row. Validates the student actually has access to what they claim to have studied, so this endpoint can't be used to fabricate activity on content never sent to them.

**Instructor endpoints:**
- `POST /instructors/login` — same `StaffUser`/`Session` mechanism as the console, bearer transport instead of cookie. Explicitly rejects non-Instructor accounts.
- `GET /instructors/me/courses` — read-only; exactly the courses assigned via `InstructorCourse`.
- `GET /instructors/courses/:courseId/content` — list of Notes under a course, gated by `requireInstructorCourseAccess`. Notes only.
- `POST /instructors/notes` — write-once upload (paste or file), reusing the exact same `resolveUploadedContent` logic the console uses. There is deliberately no PATCH/PUT anywhere in this API for Instructor content — see build plan §2/§6. **No `POST /instructors/assignments` exists** — Instructor never uploads Assignments.
- `GET /instructors/me/students` — the computed "my students" view: distinct students holding a `NoteAccess` grant (Notes only, per the amendment above) for anything under a course this instructor is assigned to. No enrollment table exists; the access grants themselves are the source of truth. Also returns **raw, scoped progress numbers** (total study seconds, last-studied) computed only from `StudySession` rows tied to this instructor's own courses' **Notes** — Assignment-derived time and titles are excluded, and a student's activity elsewhere never leaks in either.

**`GET /assignments/:id`** is Student-only now — any staff account, including Instructor, gets `no_access`. Admin/Moderator review Assignments through the console directly, never this API.

**`GET /api/v1/colleges`** — added as a deliberate exception to "no unauthenticated routes": a student has no account yet at signup time but needs to pick a college, so this one route is public, read-only, and returns only `{ id, name }`.

## What's explicitly *not* here, on purpose

No College/Course/CourseCollege/staff-account routes of any kind, and no content-edit routes. Both are permanent boundaries from the build plan (§2, §6, §7), not gaps to fill in later.

## Progress data now vs. Phase 7

`GET /instructors/me/students` returns **raw** numbers (`totalStudySeconds`, `lastStudiedAt`) — enough for a Frontend instructor view to be useful today. The **engaged / moderate / at-risk classification** on top of these numbers (7-day / 8–21-day / 21+-day thresholds, locked in the build plan) is Phase 7's job, built as a shared function both the console dashboard and this endpoint will call — so the thresholds live in exactly one place.

## Error shape

Every route returns `{ error: { code, message } }` on failure (`$lib/server/apiResponse.ts`), with codes like `not_authenticated`, `not_an_instructor`, `no_access`, `not_found`, `bad_request`, `conflict` — the Frontend can branch on `code` without parsing message strings.

## CORS

Handled globally in `hooks.server.ts` for anything under `/api/**`, including `OPTIONS` preflight — locked to `FRONTEND_ORIGIN` from `.env`, not a wildcard, since bearer tokens are involved. Set `FRONTEND_ORIGIN` before pointing a real Frontend app at this.

## Testing this phase

Without a Frontend app yet, exercise it directly:

```bash
# Student signup
curl -X POST http://localhost:5173/api/v1/students/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Student","studentCode":"S001","password":"password123","collegeId":"<a real college id>"}'
# -> { token, expiresAt, student }

# Use the token
curl http://localhost:5173/api/v1/students/me/content \
  -H "Authorization: Bearer <token>"
```

Repeat similarly for `/instructors/login` with a seeded Instructor account, then `/instructors/me/courses` and `/instructors/notes` (multipart form, not JSON, for the upload).

## Known environment limitation (not a bug)

Same as every prior phase — this couldn't be run end-to-end in the sandbox this was built in (no generated Prisma client). The type errors `svelte-check` reports here are the identical, already-understood cascade from earlier phases; nothing new or structural.

## Exit criteria

- [ ] A Student can sign up, log in, see their sent content, read a Note/Assignment they were sent (and get `no_access` for one they weren't), open it, and log a `StudySession`
- [ ] An Instructor can log in, see only their assigned courses, upload a Note to one of them, and see it appear under `GET /instructors/courses/:courseId/content`
- [ ] An Instructor's `GET /assignments/:id` request always returns `no_access`, regardless of which course the assignment belongs to
- [ ] An Instructor's `GET /me/students` reflects only students who hold grants on their own courses' content, with progress numbers scoped the same way
- [ ] No route under `/api/v1/**` allows creating/editing a College, Course, staff account, or previously-uploaded content
