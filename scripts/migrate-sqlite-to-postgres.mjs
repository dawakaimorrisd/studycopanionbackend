import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const SQLITE_PATH = "prisma/dev.db";

const tables = [
  "StaffUser",
  "College",
  "Course",
  "CourseCollege",
  "InstructorCourse",
  "Session",
  "Student",
  "StudentSession",
  "Note",
  "Assignment",
  "AssignmentSection",
  "QuestionUnit",
  "DictionaryEntry",
  "AssignmentDrillAttempt",
  "AssignmentDrillAnswer",
  "NoteTestAttempt",
  "NoteTestAnswer",
  "StudySession",
  "NoteAccess",
  "AssignmentAccess",
];

const expectedCounts = {
  College: 2,
  Course: 2,
  CourseCollege: 2,
  StaffUser: 5,
  InstructorCourse: 2,
  Session: 8,
  Student: 6,
  StudentSession: 8,
  Note: 3,
  Assignment: 1,
  AssignmentSection: 1,
  QuestionUnit: 35,
  DictionaryEntry: 38,
  AssignmentDrillAttempt: 10,
  AssignmentDrillAnswer: 80,
  NoteTestAttempt: 3,
  NoteTestAnswer: 26,
  StudySession: 74,
  NoteAccess: 7,
  AssignmentAccess: 2,
};

const dateFields = new Set([
  "createdAt",
  "deletedAt",
  "assignedAt",
  "expiresAt",
  "generatedAt",
  "testStartedAt",
  "testRevealedAt",
  "startedAt",
  "finishedAt",
  "submittedAt",
  "grantedAt",
  "openedAt",
]);

const booleanFields = new Set([
  "isTable",
  "isCorrect",
]);

if (!fs.existsSync(SQLITE_PATH)) {
  throw new Error(`SQLite database not found: ${SQLITE_PATH}`);
}

const sqlite = new Database(SQLITE_PATH, {
  readonly: true,
});

const prisma = new PrismaClient();

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteValue(value, field) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (booleanFields.has(field)) {
    return value ? "TRUE" : "FALSE";
  }

  if (dateFields.has(field)) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid DateTime in field "${field}": ${JSON.stringify(value)}`
      );
    }

    return `'${date.toISOString().replaceAll("'", "''")}'`;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function readRows(table) {
  return sqlite
    .prepare(`SELECT * FROM ${quoteIdentifier(table)}`)
    .all();
}

async function postgresCount(table) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`
  );

  return result[0].count;
}

function buildInsert(table, row) {
  const fields = Object.keys(row);

  const columns = fields
    .map(quoteIdentifier)
    .join(", ");

  const values = fields
    .map((field) => quoteValue(row[field], field))
    .join(", ");

  return `
    INSERT INTO ${quoteIdentifier(table)}
      (${columns})
    VALUES
      (${values})
  `;
}

async function main() {
  console.log();
  console.log("==============================================");
  console.log(" StudyCompanion Database Migration");
  console.log(" SQLite → Neon PostgreSQL");
  console.log("==============================================");
  console.log();

  // ----------------------------------------------------------
  // SOURCE CHECK
  // ----------------------------------------------------------

  console.log("1. Checking SQLite source...");
  console.log();

  const sourceData = {};

  for (const table of tables) {
    const rows = readRows(table);
    sourceData[table] = rows;

    const actual = rows.length;
    const expected = expectedCounts[table];

    if (actual !== expected) {
      throw new Error(
        `SOURCE COUNT MISMATCH: ${table}: expected ${expected}, found ${actual}`
      );
    }

    console.log(`   ✓ ${table}: ${actual}`);
  }

  console.log();
  console.log("SQLite source verified.");
  console.log();

  // ----------------------------------------------------------
  // DESTINATION CHECK
  // ----------------------------------------------------------

  console.log("2. Checking Neon destination is empty...");
  console.log();

  for (const table of tables) {
    const count = await postgresCount(table);

    if (count !== 0) {
      throw new Error(
        `SAFETY STOP: PostgreSQL table "${table}" already contains ${count} row(s).`
      );
    }

    console.log(`   ✓ ${table}: empty`);
  }

  console.log();
  console.log("Neon destination verified empty.");
  console.log();

  // ----------------------------------------------------------
  // TRANSACTION
  // ----------------------------------------------------------

  console.log("3. Starting PostgreSQL transaction...");
  console.log();

  await prisma.$transaction(
    async (tx) => {
      for (const table of tables) {
        const rows = sourceData[table];

        for (const row of rows) {
          await tx.$executeRawUnsafe(buildInsert(table, row));
        }

        console.log(
          `   ✓ ${table}: inserted ${rows.length} row(s)`
        );
      }
    },
    {
      maxWait: 10000,
      timeout: 120000,
    }
  );

  console.log();
  console.log("Transaction committed.");
  console.log();

  // ----------------------------------------------------------
  // VERIFICATION
  // ----------------------------------------------------------

  console.log("4. Verifying Neon against SQLite...");
  console.log();

  let sourceTotal = 0;
  let destinationTotal = 0;

  for (const table of tables) {
    const sourceCount = sourceData[table].length;
    const destinationCount = await postgresCount(table);

    sourceTotal += sourceCount;
    destinationTotal += destinationCount;

    if (sourceCount !== destinationCount) {
      throw new Error(
        `VERIFICATION FAILED: ${table}: SQLite=${sourceCount}, Neon=${destinationCount}`
      );
    }

    console.log(
      `   ✓ ${table}: SQLite ${sourceCount} = Neon ${destinationCount}`
    );
  }

  console.log();
  console.log("==============================================");
  console.log(" MIGRATION SUCCESSFUL");
  console.log("==============================================");
  console.log();
  console.log(`SQLite total rows: ${sourceTotal}`);
  console.log(`Neon total rows:   ${destinationTotal}`);
  console.log();
  console.log("All IDs were preserved.");
  console.log("All foreign-key relationships were migrated.");
  console.log("All unique constraints remain enforced by PostgreSQL.");
  console.log("Boolean values were converted correctly.");
  console.log("Date/time values were preserved.");
  console.log();
  console.log("SQLite was opened READ-ONLY.");
  console.log("prisma/dev.db was NOT modified.");
  console.log();
}

main()
  .catch((error) => {
    console.error();
    console.error("==============================================");
    console.error(" MIGRATION FAILED");
    console.error("==============================================");
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
