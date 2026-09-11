# Phase 5 — Access Grants ("Send") + Open Signal

> **Superseded as of Phase 12 (v8) — kept as a historical record, not current behavior.**
> `NoteAccess`/`AssignmentAccess` (the grant model this whole doc describes),
> the console's "Send"/"Revoke" UI, and the `/notes/:id/open`/`/assignments/:id/open`
> endpoints described below **no longer exist**. Visibility is now computed
> (paid semester access + course enrollment + published content), not
> granted per student — see `PHASE_10_PLUS_BUILD_PLAN.md`'s Phase 12. The
> "open" signal was replaced in Phase 13 by real Start/End Study session
> tracking (`POST /study-sessions/start`/`.../:id/end`) — see that plan's
> Phase 13 and `BACKEND_BUILD_PLAN.md` §4b. This doc is left unedited below
> so it remains an accurate record of what Phase 5 actually built at the
> time; don't use it as a guide to current API/console behavior.

## What this phase built (historical — see notice above)

**Send/revoke, added directly to the Note and Assignment detail pages** (no separate route — it lives where staff are already looking at the content):
- A search box (`?q=`) finds students by name or student code who haven't already been sent this Note/Assignment
- Clicking "Send" next to a result creates a `NoteAccess`/`AssignmentAccess` row, recording `grantedByStaffId`. The create is wrapped in `.catch(() => {})` — the unique `(studentId, noteId)` constraint means a double-click just no-ops instead of erroring, which matches "permanent once granted" from the plan.
- Each entry in "Sent to" shows an Opened/Not opened badge and a "Revoke" link that deletes the access row

**Open-signal API endpoints** (`/api/v1/notes/:id/open`, `/api/v1/assignments/:id/open`) — the one piece of Phase 6 pulled forward, since "send" isn't meaningfully testable without a way for the Student app to signal back that it was opened. Both:
- Require a valid student bearer token (`locals.student`, already resolved by Phase 1's `hooks.server.ts`)
- Confirm the student actually has an access grant for that record (403 `no_access` otherwise — a student can't stamp `openedAt` on something never sent to them)
- Are idempotent: `openedAt` is only ever set once, on first call

**Consistent API error shape** (`src/lib/server/apiResponse.ts`) — introduced here since these are the first `/api/v1` routes: `{ error: { code, message } }`, with a small set of reusable helpers (`notAuthenticated`, `noAccess`, etc.) so every future API route returns errors the same way, per the build plan's rule.

## Why send/revoke lives on the detail page instead of a dedicated route

Staff are already looking at a specific Note/Assignment's content and generated Q&A when deciding who should receive it — a separate "send" screen would just mean re-finding the same record. The search-and-pick UI is scoped to that one record's `?/send` and `?/revoke` actions.

## Testing this phase

1. Have at least one student already signed up (student signup itself is Phase 6 — for now, you can create one directly via Prisma Studio: `npm run db:local:studio`, add a row to `Student` with a hashed password, or temporarily insert one via the seed script pattern)
2. On a generated Note's detail page, search for that student, click Send
3. Confirm they appear under "Sent to" with a "Not opened" badge
4. `POST /api/v1/notes/:id/open` with that student's bearer token (once Phase 6 provides real student login, or manually via curl with a session token inserted directly into `StudentSession`) — confirm the badge flips to "Opened" on refresh
5. Click Revoke — confirm the row disappears and the student would no longer see this content via the API

## Exit criteria

- [ ] A Moderator can send a Note to a specific student found by search
- [ ] That student — and no one else — would see it via the API (fully provable once Phase 6 adds the student content-listing endpoint)
- [ ] The open-signal endpoint correctly rejects a student calling it for content never sent to them
