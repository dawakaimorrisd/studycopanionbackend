# Phase 0 — Scaffolding

## What this phase set up

- SvelteKit + TypeScript project (`study-companion/`), with the route tree split the whole build depends on:
  - `src/routes/console/**` — server-rendered pages, cookie auth, direct Prisma access
  - `src/routes/api/v1/**` — JSON API for the separate Frontend app, bearer-token auth (built starting Phase 6)
- Prisma installed and configured for **dual-provider support**:
  - `prisma/schema.prisma` — the single source of truth for every model
  - `scripts/set-db-provider.mjs` — rewrites only the `datasource.provider` line before `generate`/`migrate` runs, driven by a `DB_PROVIDER` env var
  - `package.json` scripts: `db:local:*` (SQLite — day-to-day in this Codespace) and `db:production:*` (Postgres via Neon — the launch target)
- Tailwind-adjacent hand-rolled design tokens in `src/app.css` (see "Design notes" below)
- Core dependencies: `@prisma/client`, `zod` (validation), `argon2` (password hashing), `mammoth` + `pdf-parse` (file text extraction)

## Why dual-provider, and why a script instead of two schema files

Prisma only allows one `datasource.provider` per schema file. Rather than hand-maintain two near-identical schema files (which drift over time), one canonical `schema.prisma` is edited in exactly one place, and `scripts/set-db-provider.mjs` swaps the provider line immediately before Prisma's CLI runs. **Never hand-edit the provider line directly** — always go through `npm run db:local:*` or `npm run db:production:*`.

Every field in the schema is deliberately provider-agnostic (no native enums, no Postgres-only types) so the same model definitions are valid on both SQLite and Postgres without special-casing. `StaffRole` and `SourceType` are plain `String`, validated with `zod` at the application boundary instead of the database.

## Design notes

The console is a data-dense internal tool, not a marketing surface — restrained on purpose. One accent color (deep teal, `--accent: #0f766e`), a serif (`Source Serif 4`) used only for page titles as a deliberate nod to the academic/institutional subject matter, everything else (`Inter`) optimized for scanning tables and forms quickly. Tokens live in `src/app.css` as CSS variables.

## Known environment limitation (not a bug)

Prisma's engine binaries are fetched from `binaries.prisma.sh` at `generate`/`migrate` time. That domain wasn't reachable from the sandbox this was built in, so those commands couldn't actually be run or tested during the build — only `svelte-check` (TypeScript/Svelte type-checking) could be used to catch mistakes. Every remaining `svelte-check` error at the end of each phase traces directly back to "no generated Prisma client exists yet" and resolves automatically the first time `npm run db:local:generate` (or `migrate`) runs somewhere with normal internet access, like this Codespace.

## Exit criteria

- [ ] `npm install` completes
- [ ] `npm run db:local:migrate` runs clean against a local SQLite file
- [ ] `npm run db:production:migrate` runs clean against a Neon connection string, from the same schema
