# Phase 7 — Analytics Dashboard

> **Superseded in parts as of Phase 12/13 (v8) — kept as a historical
> record.** `NoteAccess`/`AssignmentAccess` (referenced below as the student
> list source) no longer exist — `computeCourseProgress` now sources
> eligible students from `StudentCourse`/`StudentSemesterAccess` instead.
> Chapter-level aggregate breakdowns were considered in Phase 13 and
> explicitly rejected as dashboard clutter; per-student chapter context
> (`lastStudiedChapterTitle`, `mostStudiedContent.chapterTitle`) was added
> instead of a course-wide chart. The engaged/moderate/at-risk thresholds
> and classifier described below are unchanged and still current. See
> `PHASE_10_PLUS_BUILD_PLAN.md`'s Phase 13.

## What this phase built

**Shared analytics core** (`src/lib/server/analytics/`):
- `engagement.ts` — `classifyEngagement({ lastStudiedAt, neverOpened })`, the **one place** the locked thresholds live (build plan §9): engaged = active within `ENGAGEMENT_ENGAGED_DAYS` (default 7), at-risk = 21+ days since last activity (`ENGAGEMENT_AT_RISK_AFTER_DAYS`) **or** content sent but never opened at all, moderate = everything between. Thresholds are env-configurable, not hardcoded into a query.
- `courseProgress.ts` — `computeCourseProgress(courseId)`, the per-student aggregation for one course: total study time, last-studied, most-studied content, and a **weekly activity pattern** (seconds studied per day of week), all computed from `StudySession` + `NoteAccess`/`AssignmentAccess` rows at query time — nothing is a stored running total. Also `computeCourseEngagementCounts(courseId)`, a cheaper count-only version for overview tables.

**Console** — the dashboard is real now, not a placeholder:
- `/console` — college/course/student/content counts, generation success/failure counts, and a per-course engagement summary table (engaged/moderate/at-risk counts, linking into the drill-down)
- `/console/progress/[courseId]` — full per-student detail: engagement badge, "never opened" flag where relevant, total time, last-studied (relative), most-studied content, and a small weekly-activity bar chart (7 bars, Sun–Sat)

**Instructor API** — `GET /api/v1/instructors/me/students` (built in Phase 6 with raw-only numbers) now uses this same shared `computeCourseProgress`/`classifyEngagement`, computed per-course and merged across however many courses that instructor teaches, so the thresholds can never drift between what the console shows and what the API returns.

## Design notes

**Per-student-per-course, not per-student-globally.** `computeCourseProgress` never blends a student's activity across courses — an Instructor's (or the console's) read of a student only reflects that specific course's content. The Instructor API endpoint merges *after* computing per-course, specifically because "my students" is meant to be one combined view across an instructor's own courses — but each course's numbers were computed in isolation first.

**"Never opened" overrides recency.** A student who opened content 3 days ago but has one *other* piece of content they've never touched isn't flagged — but a student who was sent something and has never opened anything at all is always at-risk, regardless of how recently it was sent. This is a deliberate reading of the locked decision, not an approximation.

**Cost note.** The dashboard's per-course engagement table runs `computeCourseProgress` once per course on every load — fine at pilot scale (one college, a handful of courses), but the first thing to cache/optimize if this ever needs to scale up. Flagged here rather than solved now, since solving it early would be premature for the pilot's actual load.

## Testing this phase

1. As Admin, send a Note to two or three students, and log some `StudySession` rows for them with different `startedAt` dates (recent, ~10 days ago, ~30 days ago) — either via the API directly or a quick seed script — so you have one student in each bucket.
2. Visit `/console` — confirm the per-course engagement counts add up to the students you sent content to.
3. Click into `/console/progress/[courseId]` — confirm each student's badge matches what you'd hand-compute from their `StudySession` rows, and that a student you sent content to but never logged a session for opening shows as "Never opened" / at-risk.
4. Hit `GET /api/v1/instructors/me/students` as a seeded Instructor assigned to that course (bearer token) — confirm the `engagement` field matches the console's read for the same students.

## Exit criteria

- [ ] Dashboard numbers in the console match a hand-computed check against seeded `StudySession` rows, including at least one student in each of the three states
- [ ] The Instructor API's engagement classification agrees with the console's for the same student/course
