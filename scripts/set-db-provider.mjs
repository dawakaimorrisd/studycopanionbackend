#!/usr/bin/env node
// scripts/set-db-provider.mjs
//
// Prisma allows exactly one `provider` per schema file, but this project
// runs against two different databases: Neon (Postgres) in dev, SQLite in
// production (the GitHub Codespace). Rather than hand-maintain two near-
// duplicate schema files, prisma/schema.prisma stays the single source of
// truth for every model, and this script rewrites ONLY its
// `datasource.provider` line, driven by DB_PROVIDER, right before
// `prisma generate` / `prisma migrate` run.
//
// Usage (see package.json):
//   DB_PROVIDER=postgresql node scripts/set-db-provider.mjs && prisma generate
//   DB_PROVIDER=sqlite     node scripts/set-db-provider.mjs && prisma migrate deploy
//
// Never hand-edit the `provider = "..."` line in schema.prisma directly —
// run this script instead, so dev and prod can't silently drift apart.

import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA_PATH = new URL("../prisma/schema.prisma", import.meta.url);
const VALID_PROVIDERS = ["postgresql", "sqlite"];

const provider = process.env.DB_PROVIDER;

if (!provider || !VALID_PROVIDERS.includes(provider)) {
  console.error(
    `DB_PROVIDER must be one of ${VALID_PROVIDERS.join(
      ", "
    )}. Got: ${provider ?? "(unset)"}\n` +
      `Example: DB_PROVIDER=postgresql node scripts/set-db-provider.mjs`
  );
  process.exit(1);
}

const original = readFileSync(SCHEMA_PATH, "utf8");

const updated = original.replace(
  /(datasource\s+db\s*{[^}]*?provider\s*=\s*)"(postgresql|sqlite)"/s,
  `$1"${provider}"`
);

if (updated === original && !original.includes(`provider = "${provider}"`)) {
  console.error(
    "Could not find a datasource.provider line to replace — check schema.prisma's datasource block wasn't restructured."
  );
  process.exit(1);
}

writeFileSync(SCHEMA_PATH, updated);
console.log(`schema.prisma datasource provider set to "${provider}".`);
