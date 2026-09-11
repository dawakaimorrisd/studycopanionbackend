# Study Companion — Backend Build Plan (v8)

**For:** the backend engineer picking this up
**Supersedes:** the architecture/workflow sections of `planingDoc2.md` (v3), and the v4/v5 handoffs (v6 restored file upload and added dual-provider support — see §5 and §6). **v7 added Phase 9** — chapter tests for Notes and self-paced drills for Assignments. **v8 adds Phases 10–17** — Semester as the top-level academic container, real course enrollment, semester-specific paid access, chapters, content publishing, study analytics, and Assignment submission/distribution. Full detail in `PHASE_10_PLUS_BUILD_PLAN.md`; this section only updates what changed about the architecture/roles described below. **Two corrections from v7, found while implementing v8 — code is the source of truth over this doc where they disagree:** §5's "Neon is dev-only, production is SQLite" was backwards (confirmed against `package.json`'s actual `db:local:*`/`db:production:*` scripts: SQLite is dev, Postgres/Neon is production), and §9's "Neon is dev-only, permanently" bullet is the same error restated. Both are fixed in place below rather than left to mislead the next reader.

---

## 1. Why this exists

Study Companion helps students at a college study Notes and Assignments through AI-generated Q&A and a linked dictionary, instead of photocopies. It started as one department's tool; after demos landed well with two deans, it became a multi-college platform, piloted first on the College of Health Science and Midwifery. This document is the engineering handoff: a corrected schema, the rules staff/student access has to follow, and a phased plan a backend engineer can execute without re-deriving the architecture from conversation history.

## 2. The one contradiction this resolves

v3 said, in one place, that an Instructor can create their own Course, and in another, that the backend console is where College/Course/staff management lives. Those can't both be true. **Resolved: Course creation is backend-console-only, done by Admin or Moderator.** An Instructor's role in content is narrower than "creates a course" — they **upload a Note/Assignment under a Course that already exists and that they're assigned to** (via `InstructorCourse`), once, with no edit afterward. If an Instructor needs a new course to exist, they ask an Admin/Moderator to create it in the console; the Instructor never touches `Course`, `College`, or `CourseCollege` directly, from either the console (no access) or the API (not exposed).

This also settles the "not yet decided" question at the bottom of v3: **the console and the Frontend's administrator section do not end up with the same feature set.** The console keeps everything the Frontend never sees — College/Course/CourseCollege CRUD, moderator/instructor account management, `InstructorCourse` assignment, content upload + generation + review, and sending. The Frontend's Instructor view and Student view are both read/upload-scoped consumers of the API, never creators of structural data.

## 3. Architecture: what talks to what

Three UI surfaces, two codebases, one database:

| Surface | Codebase | Talks to DB via | Who uses it |
|---|---|---|---|
| Backend console | Backend (owns Prisma) | Direct Prisma calls inside `+page.server.ts` load functions and form actions — **no HTTP round-trip to its own API** | Admin, Moderator |
| Frontend — Administrator section | Frontend (separate deployment) | REST API, cross-origin, bearer token | Instructor (labeled "Administrator") |
| Frontend — Student pages | Frontend (separate deployment) | REST API, cross-origin, bearer token | Student |

The mental model is the Django-templates one: the backend console is a server-rendered app that owns the data and does the heavy lifting directly against Prisma. The **only** reason a REST API (`/api/v1/...`) exists at all is to serve the separate Frontend project, which has no database access of its own. Nothing in the console should ever call `/api/v1/...` internally — that would just be a slower, more indirect path to the same Prisma client it already has.

**Practical consequence for the engineer:** build console routes and API routes as two distinct route trees from day one (e.g. `src/routes/console/**` for cookie-authed server-rendered pages, `src/routes/api/v1/**` for bearer-token-authed JSON endpoints), sharing the same `lib/server` business logic underneath so validation/permission rules aren't duplicated — but never sharing HTTP calls between them.

## 4. Roles — updated for Phase 10+ (Semester scoping and Instructor's real Assignment involvement)

| Role | Where they log in | Scope |
|---|---|---|
| **Admin** | Console (cookie) | Everything: semesters (create/activate — the highest-blast-radius action in the app, see §4b), colleges, courses, content, students (including course enrollment and payment activation), moderators, instructor assignments, staff payment activation. Only Admin can create/delete Moderator accounts, add other Admins, or delete a student. |
| **Moderator** | Console (cookie) | Same day-to-day work as Admin — manage student course enrollment, activate/revoke student and instructor payment, upload/publish Notes and Assignments, review submissions — across all courses. Cannot manage staff accounts or delete students. |
| **Instructor** ("Administrator" in Frontend) | Frontend (bearer token) | Scoped to course(s) they're assigned via `InstructorCourse` **for the active semester specifically** — an assignment from a past semester doesn't carry forward. **Corrected in Phase 14 (v8): Instructor now has full Note AND Assignment involvement** — upload, generate, and publish ("Save for Students") themselves, via the API, for both content types, plus read access to Assignment submissions for their courses. This reverses v7's "no Assignment access at all" rule, which v8's plan (`plans.txt` §10/§11/§14/§25/§30) deliberately superseded — see `PHASE_10_PLUS_BUILD_PLAN.md`'s note on this correction. Content is still write-once (no edit after upload) and Instructor still never touches `Course`/`College`/`CourseCollege`/staff accounts/student enrollment. **New in Phase 11:** even when assigned to a course, an Instructor with lapsed `InstructorSemesterAccess` (unpaid) can do nothing content-related until reactivated — `canManageCourse` checks both course assignment and payment, not just the former. |
| **Student** | Frontend (bearer token) | Manual, self-service signup (name + studentCode, no pre-provisioned roster). **Corrected in Phase 10-12 (v8):** sees published content in courses they're specifically enrolled in (via `StudentCourse`, admin/moderator-assigned) for the active semester, AND only if their `StudentSemesterAccess` for that semester is paid. This replaces v7's "sees only Notes/Assignments explicitly sent to them" (`NoteAccess`/`AssignmentAccess`) model entirely — visibility is now computed, not granted per student. **New in Phase 15/16:** a student can submit an Assignment (individually or as a tagged group), and — as the submission's own submitter — generate study material from it and send it to eligible classmates. |

Same `Session` mechanism serves Admin/Moderator (cookie) and Instructor (bearer token) — one lookup, two transports, enforced at the route layer. `StudentSession` is the equivalent for Student.

## 4a. Phase 9 addendum — chapter tests (Notes) and self-paced drills (Assignments)

Added after a pilot-college dean asked for an objective, gradable per-chapter progress signal to sit alongside the engagement dashboard (§9's thresholds answer "are they studying"; this answers "are they passing"). Full rationale, schema, and API surface are in `docs/phases/PHASE_9.md` — this section only records the two decisions that change how the rest of this document should be read.

**`QuestionUnit` is now multiple choice, not free-text.** `answer`/`example` are gone; `optionA`–`optionD`, `correctOption`, and `explanation` replace them. `example` moved to `DictionaryEntry`. This is a shared model between Notes and Assignments (§3's "one schema" principle), so the shape change applies to both, even though the two features built on top of it are deliberately different — see below.

**Two independently-gated workflows, do not conflate them:**

| | Notes → chapter test | Assignments → drill |
|---|---|---|
| Who controls the gate | Instructor (start, then reveal — both actions) | The student themself, entirely |
| Attempts | One per student, ever | Repeatable, unlimited |
| Reveal scope | Whole chapter, all students at once | Just that one student's most recent attempt |
| New Instructor capability? | Yes — see the roles table above | No — zero staff involvement |

This does **not** reopen §2's resolved contradiction (Course/College/staff-account creation is still console-only). **Note (v8):** the sentence that used to follow this — "generation and sending are still exclusively Admin/Moderator" — is no longer accurate; see §4b. What's unchanged from this Phase 9 addendum specifically is narrower: the Instructor's "start test"/"reveal results" actions affect *when data already generated becomes visible to students taking that test*, not the generation itself.

## 4b. Phase 10–17 addendum (v8) — Semester, payment, chapters, publishing, submissions, distribution

Full detail, phase-by-phase, is in `PHASE_10_PLUS_BUILD_PLAN.md` — this section is the short version for orienting a new reader against the roles table and architecture above.

- **Semester replaces College as the top-level academic container.** Exactly one Semester is active at a time. Every piece of academic data — enrollment, payment, content, study activity — is scoped to it. A student's academic identity is now college + semester enrollment (`StudentSemester`) + specific course enrollment (`StudentCourse`, admin/moderator-assigned) — not just "which college am I in."
- **`NoteAccess`/`AssignmentAccess` (per-student manual grants) are gone entirely**, along with their console "Send" pages and `sendRecipients.ts`. Visibility is now computed at read time: paid semester access (`StudentSemesterAccess.isPaid`) + course enrollment (`StudentCourse`) + published content (`Note.publishedAt`/`Assignment.publishedAt`) = visible, automatically, to every qualifying student at once. See `lib/server/access/course.ts`'s `canAccessCourse`/`canManageCourse` — every content-serving route calls these, never an inline role/eligibility check.
- **Payment is semester-specific and manual.** `StudentSemesterAccess`/`InstructorSemesterAccess` are the live current state; `AccessPayment` is an append-only audit trail written alongside every activation, in the same transaction. No payment gateway integration exists or is planned. Payment never rolls over between semesters (Phase 17); course enrollment does, as an editable starting point.
- **Course chapters are now a real entity** (`CourseChapter`, semester-scoped), and Notes optionally belong to one. **Per direct product clarification, chapter-level breakdowns are deliberately NOT surfaced as an aggregate dashboard** — a course's chapters *are* its notes, so aggregate chapter-level time tracking is nearly note-level granularity and doesn't add a course-dashboard signal; chapter *accuracy* is already covered by test/drill scores. What chapter context IS still shown: which chapter a *specific* student was last/most studying, in per-student views (`GET /instructors/me/students`), not an aggregate chart.
- **Study session tracking is a real two-step Start/End action** — `POST /study-sessions/start` / `POST /study-sessions/:id/end`, duration computed server-side from timestamps, never client-reported. This went through several redesigns worth knowing about if you see stale references elsewhere: briefly replaced with a client-measured activity-tracking model, then a batch/sync endpoint — both reverted after confirming the Frontend actually kept this real-time pair, just calling it in short bursts (pause = a real `end`, resume = a real new `start`) to approximate activity-based behavior, which needed no backend contract change. The one genuine gap that model couldn't cover — a student going offline mid-session, where `start` can't reach the server at all — got a real addition: `POST /study-sessions/backfill`, a single client-computed duration reported after the fact once connectivity returns; this is the one place `durationSeconds` is genuinely client-measured rather than server-timed, an accepted tradeoff for an inherently-offline scenario, not an inconsistency with the rest of the design. All three are Notes-only (see the post-Phase-17 addendum below) and are also the direct replacement for the old `NoteAccess.openedAt`/`AssignmentAccess.openedAt` concept — the old `POST /notes/:id/open`/`POST /assignments/:id/open` endpoints are removed, not deprecated-and-kept.
- **Assignment gains a `type`** (`INDIVIDUAL` | `GROUP`, immutable after creation) and a real submission model: `AssignmentSubmission` (the actual uploaded work), `AssignmentSubmissionMember` (the group-tagging flow — who's in the group, visible to whoever manages the course), and `AssignmentDistribution`/`AssignmentDistributionRecipient` (a second, unrelated flow: the submitter generating study material from their own submission and explicitly sending it to eligible classmates — never called "tagging," never auto-broadcast on submit).
- **Instructor's Assignment involvement reverses v7's rule entirely** — see §4's roles table. This was a real correction made mid-build: v7/Phase 0-9's "Instructor has zero Assignment access" was treated as the default assumption when v8 implementation started, until cross-referenced against `plans.txt`'s explicit spec (§10/§11/§14/§25/§30) and corrected.

## 4c. Post-Phase-17 addendum — PDF-first Assignments, GROUP-only distribution, real distribution gating

Built in response to real Frontend integration feedback (`BACKEND_HANDOFF(2).md`), after Phase 17 was otherwise considered complete:

- **Assignments (and everything under them — submissions, distributions) are read as PDF, for every role, replacing the structured `sections` rendering Notes still use.** See §6/§6a above for the full mechanics. This is a genuine architectural split between the two content types now: Notes = structured, generated, chapter-test-gated reading; Assignments = PDF, no reading-time gating or tracking at all.
- **Generate-and-distribute is GROUP-only** — an INDIVIDUAL submission still gets `rawText` extracted and a `pdfUrl` rendered (same pipeline), but has no generate/distribute action. `lib/server/access/assignment.ts`'s `canGenerateFromSubmission` is the single gate both `POST /submissions/:id/generate` and the distribute flow check, so they can't drift apart on this rule.
- **A submission's own submitter can now actually drill their own generated material** — `POST /submissions/:id/generate`'s response includes the full, ungated `questionUnits` (there was previously no way at all, not even insecurely, to do this). Ungated deliberately: it's their own work, not something they're receiving from someone else.
- **`GET /students/me/received-distributions` is now actually gated, not cosmetically gated.** It used to send `correctOption`/`explanation` fully revealed unconditionally — real, but explicitly temporary, to ship the intended UI/UX before the mechanism existed. New `DistributionDrillAttempt`/`DistributionDrillAnswer` models plus `POST /distributions/:id/drill/start`/`.../submit` (mirroring `AssignmentDrillAttempt` exactly — self-paced, repeatable, reveal tracks only the most recent attempt) make the gating real: `correctOption`/`explanation` are now `null` until the recipient's most recent attempt on that specific distribution is finished.
- **`GET /students/me/assignments/:id/submission`** — new, answers "did I already submit this" for either the submitter or a tagged group member, replacing what had been a `localStorage`-only stopgap on the Frontend.
- **Storage got a real correction, not just an addition** — see §6a. `LocalFileStorage` was reintroduced as the dev default; it does not work correctly across multiple serverless instances, which is very likely what caused a real 404 that prompted this whole PDF redesign to begin with.

## 4d. Assignment/Submission collapse — the biggest single correction in this entire build

Per direct, repeated product clarification: an Assignment was never meant to be a staff-created digital task. **"What the instructor assigns as homework happens in class, out of the app entirely — the app's only job is being the place a student turns their completed homework into something useful."** Confirmed explicitly: nobody pre-creates an Assignment record — not Instructor, not Admin either. A student's own upload creates it.

This eliminated the two-entity model (staff-authored `Assignment` + student-created `AssignmentSubmission` pointing at it) entirely, merging them into a single `Assignment` model, student-authored end to end:
- **Removed:** `AssignmentSection` (no staff-authored prompt to split), `AssignmentDrillAttempt`/`AssignmentDrillAnswer` (no staff-authored content to drill — a submitter's own generated material is read fully revealed, per §4c; a distribution recipient's is gated via `DistributionDrillAttempt`, unchanged), every Instructor/Admin/Moderator create/generate/publish endpoint for Assignment, `Assignment.publishedAt`/`publishedByStaffId`/`uploadedByStaffId`.
- **New creation surface:** `POST /students/me/courses/:courseId/assignments` (multipart — title?, type, groupName?/memberStudentIds? for GROUP, file) and `GET /students/me/courses/:courseId/eligible-group-members` (course-scoped, since no assignment id exists yet to scope the old version to).
- **`QuestionUnit.sourceType`** dropped from three values to two (`NOTE` | `ASSIGNMENT`) — the third, `ASSIGNMENT_SUBMISSION`, only ever existed because Assignment and submission were briefly separate entities.
- **`GET /assignments/:id`** lost its staff-vs-student shape split entirely — everyone who can see an Assignment at all (submitter, tagged GROUP member, or staff via `canManageCourse`) sees it fully revealed, unconditionally. There's no one else grading or gating a student's own homework's self-check questions.
- Everything built in §4c (PDF-first reading, GROUP-only generate/distribute, real `DistributionDrillAttempt` gating) carried over unchanged in contract — it was already modeled around "my own submission," never a separate task definition, so nothing there needed to change once creation itself was fixed.

Full detail: `docs/FRONTEND_HANDOFF_PHASE_10_PLUS.md` v4, §5-§6.

## 5. Database: one schema, two providers

**Corrected (v8) — this section had dev/production backwards.** Dev runs against **SQLite inside a GitHub Codespace**; production runs against **Postgres via Neon**. Confirmed against `package.json`'s actual scripts (`db:local:*` → sqlite, `db:production:*` → postgresql), which are what's real — the script names and provider mapping below were previously stated backwards (as `db:dev:*`→postgresql / `db:prod:*`→sqlite), which never matched the actual `package.json`. Prisma only allows one `datasource.provider` per schema file, so rather than maintaining two near-duplicate schema files by hand, this project keeps **`prisma/schema.prisma` as the single source of truth for every model**, and a small script — `scripts/set-db-provider.mjs` (attached) — rewrites only the `provider` line right before `prisma generate` / `prisma migrate` runs, driven by a `DB_PROVIDER` env var:

```json
// package.json (actual scripts)
{
  "scripts": {
    "db:local:generate":      "DB_PROVIDER=sqlite node scripts/set-db-provider.mjs && prisma generate",
    "db:local:migrate":       "DB_PROVIDER=sqlite node scripts/set-db-provider.mjs && prisma migrate dev",
    "db:production:generate": "DB_PROVIDER=postgresql node scripts/set-db-provider.mjs && prisma generate",
    "db:production:migrate":  "DB_PROVIDER=postgresql node scripts/set-db-provider.mjs && prisma migrate deploy"
  }
}
```

**Rule: never hand-edit the `provider` line in `schema.prisma` directly** — always run the script (or the npm script that wraps it), so dev and prod can't silently drift apart. `DATABASE_URL` itself is a normal env var either way (a local `file:./dev.db` path in dev, Neon connection string in production).

This is also why every field in the schema is deliberately provider-agnostic — no native enums, no Postgres-only column types (including in the Phase 10+ additions — `AccessPayment.amountCents` is `Int`, not `Decimal`, for the same reason). `StaffRole`, `SourceType`, `AssignmentType`, and `correctOption` are all plain `String`, validated at the app boundary with `zod` rather than the database, precisely so the same model definitions are valid on both Postgres and SQLite without special-casing.

## 6. File upload, storage, and PDF-first Assignment reading (rewritten — several generations stale below)

Notes and Assignments accept **either pasted text or an uploaded file** (PDF/DOCX). The upload path:

1. Staff (console) or Instructor (API) uploads a file, or pastes text.
2. Server-side text extraction (`pdf-parse` for PDF, `mammoth` for DOCX) runs **synchronously** at upload time — cheap, deterministic parsing, not AI, no async handling needed. The extracted (or pasted) text is written into `rawText`.
3. **Assignments only** (not Notes — see below): a PDF is also produced at the same time — `pdfUrl` — either the uploaded file passed through unchanged (if it was already a PDF) or rendered from the extracted/pasted text (`lib/server/pdfConversion.ts`, using `pdf-lib`, pure JS, no native binary). This is what a student, Instructor, or Admin/Moderator actually reads — Assignments moved to a PDF-first reading model (direct product decision, post-Phase-17): unlike a Note's structured, generated reading experience, an Assignment is just "open the PDF," for everyone. `rawText` remains purely the generation input; the two are independent outputs of the same upload.
4. The original file (and, for Assignments, the rendered/passed-through PDF) is persisted via the storage adapter below; `sourceFileUrl`/`sourceFileName`/`sourceFileMimeType` record the original, `pdfUrl`/`pdfConversionError` record the PDF outcome.
5. Everything downstream — generation, the `[SECTION:]` splitter — reads only `rawText`, never re-touches the file or the PDF.

**Honest limitation on the PDF:** when rendered from text (DOCX source, or pasted text with no file at all), it's a clean, readable, plain-text-style PDF — not a pixel-perfect copy of an original Word document's tables/images/formatting. A real pixel-perfect conversion needs either a system LibreOffice binary or a paid conversion API, neither available in the environment this was built in, and LibreOffice specifically is a poor fit for a typical serverless deploy target. If visual fidelity becomes a real requirement, that's an infrastructure decision, not a code fix.

## 6a. Storage adapter — corrected, dual-provider (this section was wrong for a while)

```ts
// lib/server/storage.ts
interface FileStorage {
  save(file: { buffer: Buffer; name: string; mimeType: string }): Promise<{ url: string }>;
  read(url: string): Promise<Buffer>;
}
```

Two implementations exist, chosen at startup by `STORAGE_PROVIDER` (see `.env.example`):

- **`LocalFileStorage`** (default — `STORAGE_PROVIDER` unset or anything other than `"cloudinary"`): writes to `static/uploads/studycompanion/`, served back out at `/uploads/studycompanion/...` through SvelteKit's static handling. Exists specifically so local development doesn't require Cloudinary credentials.
- **`CloudinaryStorage`** (`STORAGE_PROVIDER=cloudinary`, needs `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`): uploads as a `resource_type: 'raw'` asset, returns Cloudinary's `secure_url`.

**`LocalFileStorage` is unsafe for any real multi-instance/serverless deployment — this needs to be understood, not just noted.** A typical serverless/edge host (this project's `netlify.toml` suggests Netlify Functions) may serve different requests from different, short-lived function instances, each with its own ephemeral filesystem. A file `LocalFileStorage` saves during one invocation is not guaranteed to exist for — or even be visible to — a later invocation that serves a subsequent read of it, even seconds later. **This is very likely what actually caused a real-world 404** (`GET /uploads/studycompanion/<uuid>.docx`) an Instructor hit trying to open a student's submitted file — the URL shape matches this adapter exactly. `CLOUDINARY_STORAGE` must be enabled for any deployment where this matters, which is effectively every deployment except a single long-lived dev process (`npm run dev`, or a Codespace).

**Two docs previously got this backwards, corrected now:** `docs/phases/PHASE_8.md` said Cloudinary "removes the previous dependency on `data/uploads/`" — local disk was reintroduced as the dev default afterward, and that doc now has a correction banner. `README.md` referenced a `backup:uploads` npm script for that old local directory that doesn't actually exist in `package.json` — removed from the scripts table rather than left to be discovered as broken.

When a real second cloud provider (e.g. Cloudflare R2) is wanted later, it's a third implementation of the same `FileStorage` interface, swapped in the same way — no schema change, since the DB only ever stores the opaque `url` string this interface returns.

## 7. Build rules

- **Validate at the boundary.** Every console form action and every API route validates its input with `zod` before touching Prisma — including role/sourceType strings, since neither Postgres nor SQLite is relied on to catch a bad value here.
- **Permission checks live in `lib/server`, not in route files.** A `requireRole(session, ['ADMIN','MODERATOR'])` / `requireCourseAccess(instructorId, courseId)` style helper, called at the top of every console action and every API handler, so the Admin-only-vs-Moderator and Instructor-course-scoping rules can't drift between routes.
- **API is versioned and CORS-locked.** `/api/v1/...`, with `Access-Control-Allow-Origin` restricted to the Frontend's known origin(s) — not a wildcard, since bearer tokens are involved.
- **Consistent API error shape**, e.g. `{ error: { code, message } }`, so the Frontend can branch on `code` rather than parsing message strings.
- **Every mutation in the console that has downstream effects (send, generate, delete) should be a named form action, not a generic POST** — keeps the audit trail (who did what) readable directly from route names/logs.
- **Never expose `College`/`Course`/`CourseCollege`/staff-account write endpoints on the API, and never expose a Note/Assignment edit endpoint for anyone** — both are deliberate, permanent boundaries, not oversights to revisit casually. **Corrected (v8):** the older version of this bullet also said "never expose a content-edit endpoint for Instructor" as if Instructor's *read/generate/publish* access to Assignments was similarly forbidden — that part was wrong as of Phase 14; Instructor now has full Note/Assignment create-generate-publish access (see §4). What's still permanently forbidden for every role, including Admin/Moderator, is *editing* already-uploaded content — the write-once rule, not who gets to write once.
- **Never hand-edit `schema.prisma`'s provider line** — see §5.

## 8. Phased build plan

**Phase 0 — Scaffolding**
Set up the SvelteKit project with the `console/` and `api/v1/` route trees, `prisma/schema.prisma` + `scripts/set-db-provider.mjs` + the `db:dev:*`/`db:prod:*` npm scripts, Neon connection string for dev, environment variables for the Groq key(s). *Exit criteria: `npm run db:dev:migrate` runs clean against Neon locally; `npm run db:prod:migrate` runs clean against a local SQLite file, from the same schema.*

**Phase 1 — Schema & auth foundation**
Apply the schema, run the first migration (dev target). Password hashing (argon2 or bcrypt) for `StaffUser` and `Student`. Console login (role selector Admin/Moderator → cookie `Session`). API auth for Student signup/login and Instructor login (bearer token → same `Session` table). Seed script creating one Admin account. *Exit criteria: an Admin can log into the console; a manually-signed-up Student can obtain a token from the API.*

**Phase 2 — Console: College/Course/Staff management**
CRUD for `College`, `Course`, `CourseCollege` linking. Admin creates Moderator and Instructor accounts; Admin assigns `InstructorCourse`. Student roster view (Admin/Moderator view; delete is Admin-only). *Exit criteria: an Admin can stand up a new College, create Courses, link them, create staff accounts, and assign an Instructor to a course, entirely from the console.*

**Phase 3 — Content ingestion (paste + upload)**
Console upload flow for Notes and Assignments: paste `rawText` directly, or upload a PDF/docx that gets parsed into it via the `LocalDiskStorage` adapter from §6. Deterministic `[SECTION: heading]` parser for Assignments. Instructor upload path via API (same paste-or-file options), **Notes only**, scoped to their `InstructorCourse` rows only, write-once (no update route) — Instructor has no Assignment access at all (see §4). *Exit criteria: a Note and an Assignment (with sections) exist with populated `rawText` from both a pasted-text upload and a file upload; the Note from both the console and an Instructor via the API, the Assignment from the console only — and a second call to "edit" the Instructor's upload correctly fails.*

**Phase 4 — AI generation pipeline (synchronous)**
Console "Generate" form action: Groq, structured JSON schema, validate-and-retry-once, all inline in the request (originally Gemini-primary/Groq-fallback — Gemini was removed in a later amendment, see §4a and `docs/phases/PHASE_9.md`; Groq now supports up to 5 selectable keys instead). On success, write `QuestionUnit`/`DictionaryEntry` rows and stamp `generatedAt`; on failure, write `generationError` and leave it clickable again. Console review/edit UI for the resulting rows before anything is sent. *Exit criteria: clicking Generate on a real Note (including one whose rawText came from an uploaded file) produces reviewable question units and dictionary entries within the same request/response cycle.*

**Phase 5 — Access grants ("send") + open signal**
Console action to grant `NoteAccess`/`AssignmentAccess` to specific students (search/select UI), recording `grantedByStaffId`. API endpoint for the Student app to stamp `openedAt` on first open. *Exit criteria: a Moderator sends a Note to a specific student; that student, and no one else in their college, sees it via the API.*

**Phase 6 — Public REST API for the Frontend app**
Full `/api/v1/...` surface: Student signup/login/list-accessible-content/read-content/log-`StudySession`; Instructor login/list-assigned-courses (read-only)/upload-content (paste or file, write-once)/list-content-under-those-courses/computed "my students" view/scoped progress data. Confirm no College/Course/staff-write routes, and no content-edit routes, exist here. *Exit criteria: the separate Frontend project can be built against this API with zero direct database access.*

**Phase 7 — Analytics dashboard**
Aggregation queries over `StudySession`: total study time, weekly activity pattern, last-studied, most-studied content, and engaged/moderate/at-risk classification per §9's locked thresholds (7-day / 8–21-day / 21+-day-or-never-opened, computed per-student-per-course, driven by config rather than hardcoded). Exposed fully in the console (all courses) and, scoped, via the API for Instructor. *Exit criteria: dashboard numbers in the console match a hand-computed check against seeded `StudySession` rows, including at least one student in each of the three states.*

**Phase 8 — Hardening & handoff**
Rate limiting on auth endpoints, consistent error responses, structured logging, CORS review, a demo/seed data script, a `data/uploads/` backup step per §9, and a short runbook covering both `DB_PROVIDER` targets and the Codespace-hosted production instance day to day.

**Phase 9 — Chapter tests (Notes) & self-paced drills (Assignments)**
`QuestionUnit` pivoted from free-text to multiple choice (`optionA`–`optionD`, `correctOption`); `example` moved to `DictionaryEntry`. `Note` gains `chapterLabel` (a label, not a new structural split — see §4a) plus `testStartedAt`/`testRevealedAt`. Two new instructor-only console-adjacent API actions (`test/start`, `test/done`), a student-only `test/submit` (one attempt, enforced at the DB level), and analytics extended with per-chapter score trends, additive to Phase 7's engagement classifier, not a replacement. Independently: `AssignmentDrillAttempt`/`AssignmentDrillAnswer` give Assignments a fully self-paced, student-controlled, repeatable practice flow with zero staff involvement — reveal tracks only the student's most recent attempt. Full detail, including why an initial `Test`-entity design was cut in favor of two timestamps on `Note`, in `docs/phases/PHASE_9.md`. *Exit criteria: see that doc's own checklist — this phase has not yet been migrated or run (see README_HANDOFF.md).*

**Phases 10–17 (v8) — Semester, monetization, chapters, publishing, analytics, submission/distribution**
Condensed here; full phase-by-phase detail (schema, routes, exit criteria) is in `PHASE_10_PLUS_BUILD_PLAN.md`, not duplicated into `docs/phases/PHASE_10.md`–`PHASE_17.md` as separate files — a deliberate choice to keep one authoritative doc for this whole arc rather than eight thin ones. See `docs/phases/README.md`.
- **10 — Global Semester & Academic Enrollment:** `Semester`, `StudentSemester`, `StudentCourse`, `InstructorCourse` becomes semester-scoped. The `canAccessSemester`/`canAccessCourse`/`canManageCourse` authorization layer (`lib/server/access/`) is built here and used by every later phase.
- **11 — Semester Access & Monetization:** `StudentSemesterAccess`, `InstructorSemesterAccess`, `AccessPayment`. Manual activation only, no gateway.
- **12 — Course Chapters & Content Publishing:** `CourseChapter`; `Note`/`Assignment` gain `semesterId`/`publishedAt`. `NoteAccess`/`AssignmentAccess` and the console's Send pages are deleted, replaced by "Save for Students."
- **13 — Study Tracking & Analytics:** Real Start/End Study session tracking (§4b); course-level (not chapter-level) analytics dashboards, with chapter context preserved at the per-student level.
- **14 — Instructor Assignments:** `Assignment.type` (INDIVIDUAL/GROUP); Instructor gains full create/generate/publish/read parity with Notes (§4b's correction).
- **15 — Assignment Submission:** `AssignmentSubmission`, `AssignmentSubmissionMember`.
- **16 — Assignment Study Distribution:** `AssignmentDistribution`, `AssignmentDistributionRecipient`; `QuestionUnit` gains a third source type, `ASSIGNMENT_SUBMISSION`, reusing the same synchronous generation pipeline.
- **17 — Semester Rollover:** Activating a new semester copies each enrolled student's `StudentSemester`/`StudentCourse` forward as an editable starting point and resets payment to unpaid — never the reverse. Instructor course assignments do NOT auto-roll-forward (deliberate — see `plans.txt` §4's reasoning that an instructor's teaching load is expected to change semester to semester).

## 9. Decisions locked in this pass

- **Engaged / moderate / at-risk thresholds — final.** Engaged = active in the last 7 days; moderate = last active 8–21 days ago; at-risk = 21+ days since last activity, or content sent but never opened at all. Computed **per-student-per-course** (an Instructor's dashboard only reflects activity on their own course's content). Stored as config (env var or a small `Settings` row), not hardcoded into the query, so it can be tuned after watching real usage without a redeploy. This is now a Phase 7 build target, not an open question.
- **Neon is production-only.** **Corrected (v8):** this bullet previously said "Neon is dev-only, permanently. Production stays SQLite" — backwards, see the file-top correction note. The actual rule: dev runs SQLite in the Codespace; production runs Postgres/Neon; production migrations need to be tested against Postgres, not SQLite, before a real launch.
- **`data/uploads/` gets backed up.** Since local-disk storage doesn't survive a Codespace rebuild/rotation by default, Phase 8's runbook includes a backup step for that directory (e.g. a periodic copy out to some durable location) until R2 replaces local storage entirely.
- **One attempt per student per Note test, no retakes — final.** Confirmed explicitly during the Phase 9 discussion, enforced by a unique constraint (`NoteTestAttempt`), not just an app-level check.
- **A chapter's test always covers every generated question for that Note — no instructor-curated subset/range.** An earlier draft had instructors picking "questions 1–10"; confirmed this isn't wanted. Simplifies the model considerably — no `Test`/`TestQuestion` entities exist.
- **Assignment drills stay self-study, never graded or scored in any staff-facing analytics.** **Corrected (v8):** this bullet used to justify itself with "Instructor has zero Assignment access of any kind" — no longer true (§4b). The actual reason drills don't feed staff analytics is unchanged though: there is no grading/feedback mechanism anywhere in this app, for anything, and a self-paced repeatable practice drill was never intended to be a graded signal even for the Instructor who can now read the Assignment itself.
- **Chapter-level analytics are per-student detail only, never an aggregate dashboard — final, per direct product decision in Phase 13/v8.** A course's chapters are its notes (e.g. "Accounting212" is the course, its notes are the chapters), so a "most/least studied chapter" chart adds close to nothing beyond note-level and was explicitly rejected as dashboard clutter. What's kept: `lastStudiedChapterTitle`/`mostStudiedContent.chapterTitle` on a *specific* student's record, because an instructor looking at one student's activity should still be told which chapter they were actually in.
- **Study session tracking is Start/End, not single-shot logging — final, per direct product decision in Phase 13/v8.** `POST /study-sessions/start` then `POST /study-sessions/:id/end`, duration computed server-side from timestamps. This is also the permanent replacement for `NoteAccess`/`AssignmentAccess`'s old `openedAt` field — "opened" is now "a StudySession exists," not a separate tracked boolean.
- **No payment gateway integration, ever, unless explicitly revisited.** `AccessPayment` is a manual audit trail row, not a transaction record from Orange Money/Lonestar/any processor. Confirmed multiple times across the Phase 10+ plan discussion (`plans.txt` §6) — don't build toward one speculatively.
- **Assignment cover pages (a two-tier general/college-specific template idea, prefilled instructor info, generated per-submission) — explicitly deferred, not decided against.** Raised during Phase 15/16 discussion and set aside as its own design pass rather than guessed at; open questions (merge into the uploaded file vs. a separate structured record; template ownership — per-`InstructorCourse` or per-`College`; who authors templates) are unresolved, not implemented.