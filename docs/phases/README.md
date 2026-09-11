# Study Companion Backend — Phase Docs

Each phase has its own doc: what got built, why, how to test it, and its exit criteria. Read `../../BACKEND_BUILD_PLAN.md` first for the overall architecture and roles — these docs assume that context.

- [Phase 0 — Scaffolding](./PHASE_0.md)
- [Phase 1 — Schema & Auth Foundation](./PHASE_1.md)
- [Phase 2 — Console: College/Course/Staff Management](./PHASE_2.md)
- [Phase 3 — Content Ingestion (Notes & Assignments)](./PHASE_3.md)
- [Phase 4 — AI Generation Pipeline (Synchronous)](./PHASE_4.md) — see also [amendment: content density fix](./PHASE_4_AMENDMENT.md)
- [Phase 5 — Access Grants ("Send") + Open Signal](./PHASE_5.md)
- [Phase 6 — Public REST API for the Frontend App](./PHASE_6.md)
- [Phase 7 — Analytics Dashboard](./PHASE_7.md)
- [Phase 8 — Hardening & Handoff](./PHASE_8.md)
- [Phase 9 — Chapter Tests (Notes) & Self-Paced Drills (Assignments)](./PHASE_9.md)

**Phases 10–17 are not individual files here** — they're documented as one
consolidated doc, [`../../PHASE_10_PLUS_BUILD_PLAN.md`](../../PHASE_10_PLUS_BUILD_PLAN.md),
covering the Semester/monetization/chapters/publishing/analytics/submission-
distribution rebuild as a single connected arc rather than eight thin,
cross-referencing files. `../../BACKEND_BUILD_PLAN.md` §4b has the short
version if you just need the headline changes to roles/architecture.
Phase 5's `NoteAccess`/`AssignmentAccess` grant model described in its doc
below is **removed as of Phase 12** — that doc is kept as a historical
record of what Phase 5 built and why, not as current behavior.

All 18 phases (0–17) are built. **Phases 9 through 17 are not yet
migrated/verified** — see `PHASE_10_PLUS_BUILD_PLAN.md`'s own status note
and `../../README_HANDOFF.md`'s "Known environment limitation" section. See
`../RUNBOOK.md` for day-to-day operation, including first-time Semester
activation, which is new as of Phase 10.

## Database reminder (important, corrected mid-build)

- **SQLite** = day-to-day, inside this Codespace (`npm run db:local:*`) — the default in `.env.example`
- **Postgres via Neon** = the production launch target (`npm run db:production:*`) — switch `DB_PROVIDER` and `DATABASE_URL` in `.env` when ready to test/launch against it

Both come from the same `prisma/schema.prisma` — see Phase 0's doc for why, and never hand-edit the `provider` line directly. (`BACKEND_BUILD_PLAN.md` §5 previously stated this backwards — SQLite/Neon roles swapped — and has since been corrected; this file was already accurate.)
