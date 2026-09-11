# Phase 1 — Schema & Auth Foundation

## What this phase built

**Shared server core** (`src/lib/server/`):
- `db.ts` — Prisma client singleton (avoids spinning up a new DB connection on every Vite dev reload)
- `env.ts` — typed, centralized env var access instead of scattered `process.env.X` reads
- `auth/password.ts` — `argon2` hash/verify, with `verifyPassword` swallowing malformed-hash errors as a plain failed login (never throws in a way that could leak whether an account exists)
- `auth/session.ts` — session creation/validation for **both** `StaffUser` (Admin/Moderator/Instructor, via `Session`) and `Student` (via `StudentSession`). Tokens are opaque 32-byte random strings, not JWTs — deliberately, since an opaque token is trivially revocable (delete the row) and there's nothing that needs encoding in it.
- `auth/permissions.ts` — `requireStaffRole`, `requireAdminOrModerator`, `requireAdmin`, `requireInstructorCourseAccess`, `instructorCourseIds`. Every console action and API route calls into these rather than checking `locals.staff.role` inline, so permission rules can't drift between routes.

**Auth transport** (`src/hooks.server.ts`):
- `/console/**` → cookie (`session`), same-origin
- `/api/**` → `Authorization: Bearer <token>` header, cross-origin, with CORS locked to `FRONTEND_ORIGIN` (including OPTIONS preflight handling)
- Both transports validate against the same underlying `Session`/`StudentSession` tables — see build plan §3/§4

**Console auth UI**:
- `/console/login` — role selector (Admin/Moderator) + name/password. Login errors are deliberately generic ("Incorrect name, password, or account type") so a failed attempt can't be used to fingerprint whether an account or role exists.
- `/console/logout` — invalidates the session server-side, then clears the cookie
- `/console/+layout.server.ts` — redirects to login for any unauthenticated visit to a console route, and redirects *away* from login if already signed in
- `/console` — placeholder dashboard (real dashboard content arrives in Phase 7)

**Seed script** (`prisma/seed.ts`):
- Creates exactly one Admin account from `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` in `.env`. Safe to re-run — no-ops if that name already exists.

## Why one `Session` mechanism for two transports

Admin, Moderator, and Instructor are all `StaffUser` rows differing only by `role`. Rather than build separate auth systems, they share one `Session` table — the only difference is *where* the token is read from (cookie for console, header for API), enforced entirely in `hooks.server.ts`. This is what makes `requireInstructorCourseAccess` reusable later for Instructor API routes without a parallel permission system.

## Testing this phase

```bash
npm install
cp .env.example .env    # then set SEED_ADMIN_PASSWORD to something real
npm run db:local:migrate
npm run seed
npm run dev
```

Visit `/console/login`, sign in as Admin with the seeded credentials. You should land on `/console` and see your name/role in the sidebar.

## Exit criteria

- [ ] An Admin can log into the console
- [ ] Visiting any `/console/*` route while signed out redirects to `/console/login`
- [ ] Signing out and attempting to reuse the old session fails
