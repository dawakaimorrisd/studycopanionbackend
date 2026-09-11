# Phase 2 — Console: College / Course / Staff Management

## What this phase built

**Colleges** (`/console/colleges`) — Admin/Moderator create and list. That's the entire surface; there's no edit/delete yet (not called for by the plan at this stage).

**Courses** (`/console/courses`) — Admin/Moderator create, with **optional** college linking at creation time (per the plan: "College linkage is optional at creation... an instructor can pick the college(s)... or skip it entirely"). Each course row has an expandable panel to link/unlink colleges after the fact, since a course (Math, English) can belong to multiple colleges — that's `CourseCollege`, a join table, not a single `collegeId`.

**Staff** (`/console/staff`) — **Admin-only** creation of Moderator/Instructor/Admin accounts (Moderator cannot create staff of any kind, per the plan). Admin assigns/unassigns Instructors to specific courses via `InstructorCourse` — this is the entire mechanism that scopes an Instructor's access later. Deactivation (soft delete via `deletedAt`) is Admin-only, blocks self-deactivation (so the console always has at least one usable Admin), and invalidates the deactivated account's sessions immediately.

**Students** (`/console/students`) — a **read-only roster view** (filterable by college) plus Admin-only delete. There's deliberately no creation form here — students self-register from the Frontend app (name + student code), matching the "fully manual, no pre-provisioned roster" decision.

## Permission summary for this phase

| Action | Who |
|---|---|
| Create/view College | Admin, Moderator |
| Create Course, link/unlink College | Admin, Moderator |
| Create staff account (any role) | **Admin only** |
| Assign/unassign Instructor↔Course | **Admin only** |
| Deactivate staff | **Admin only**, not self |
| View student roster | Admin, Moderator |
| Delete student | **Admin only** |

## Testing this phase

With the Phase 1 Admin account:
1. Create a College (e.g. "College of Health Science and Midwifery")
2. Create a Course (e.g. "Anatomy I" / `ANAT101`), optionally linking it to the College immediately
3. Go to Courses, expand the row, confirm you can link/unlink colleges after the fact
4. Go to Staff, create a Moderator and an Instructor account
5. Assign the Instructor to the Course you created; confirm it shows up under "Assigned"
6. Confirm a Moderator account (log in as them) can create Colleges/Courses but the Staff page's mutating actions are blocked

## Exit criteria

- [ ] An Admin can stand up a new College, create a Course, link them, create staff accounts, and assign an Instructor to a course — entirely from the console
- [ ] A Moderator can do the same content-ops work but cannot create/deactivate staff or delete a student
