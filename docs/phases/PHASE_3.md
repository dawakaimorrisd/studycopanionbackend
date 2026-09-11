# Phase 3 — Content Ingestion (Notes & Assignments)

## What this phase built

**Shared upload logic** (`src/lib/server/`):
- `contentUpload.ts` — `resolveUploadedContent(formData)`, used by both the console form action and (later, Phase 6) the Instructor API route. Enforces "paste text OR upload a file, not both, and not neither" in exactly one place, so every caller gets the same validation and error messages.
- `parseFile.ts` — synchronous PDF/DOCX → text extraction (`pdf-parse` v1, `mammoth`). Deliberately synchronous: this is cheap, deterministic parsing, not AI, so it runs inline in the upload request rather than needing any async job handling.
- `storage.ts` — the `FileStorage` interface plus a `LocalDiskStorage` implementation (writes to `data/uploads/`, returns an opaque `local:<uuid>` key). When Cloudflare R2 is wired up later, it's a second implementation of the same interface — no schema change, since the DB only ever stores the opaque `url` string this returns.
- `assignmentSections.ts` — deterministic `[SECTION: heading]` parser for Assignments. Pure string parsing, no AI. Content with no markers becomes a single heading-less section rather than being dropped.

**Notes** (`/console/notes`):
- List view with generation/send status badges
- `/console/notes/new` — course selector, optional title, paste-or-upload toggle
- `/console/notes/[id]` — shows raw content, a link to the original file (if uploaded), and placeholders for question units / sent-to (filled in by Phases 4 and 5)

**Assignments** (`/console/assignments`) — same shape as Notes, plus:
- The section parser runs at creation time, writing `AssignmentSection` rows
- The detail page shows each parsed section with its heading

**File serving** (`/console/files/[key]`) — authenticated route (requires a console session) that reads a file back out through the same storage adapter used to save it. Deliberately not a public static folder, since these are institutional documents.

## Design decision: generation runs on the whole `rawText`, not per-section

`AssignmentSection` exists for the "replace photocopies" story (a clean printable/readable split), not as a generation boundary — there's no `sectionId` on `QuestionUnit`. Phase 4's generation reads the full `rawText`, same as for Notes.

## Testing this phase

1. Go to `/console/notes/new`, pick a course, paste some text, submit — confirm it lands on the detail page showing that text
2. Repeat with a PDF or DOCX upload instead — confirm the extracted text appears in `rawText` and the original filename is a working download link
3. Go to `/console/assignments/new`, paste text containing a couple of `[SECTION: ...]` markers — confirm the detail page shows them split correctly
4. Confirm submitting with *both* pasted text and a file, or with *neither*, is rejected with a clear error

## Exit criteria

- [ ] A Note and an Assignment (with sections) exist with populated `rawText`, created from both a pasted-text upload and a file upload
- [ ] The uploaded file's original is downloadable from the detail page
