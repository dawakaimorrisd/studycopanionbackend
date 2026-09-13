-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "groupName" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'PROCESSING',
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "rawText" TEXT,
    "pdfUrl" TEXT,
    "pdfConversionError" TEXT,
    "generatedAt" DATETIME,
    "generationError" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("courseId", "fileMimeType", "fileName", "fileUrl", "generatedAt", "generationError", "groupName", "id", "pdfConversionError", "pdfUrl", "rawText", "semesterId", "submittedAt", "submittedById", "title", "type") SELECT "courseId", "fileMimeType", "fileName", "fileUrl", "generatedAt", "generationError", "groupName", "id", "pdfConversionError", "pdfUrl", "rawText", "semesterId", "submittedAt", "submittedById", "title", "type" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE INDEX "Assignment_courseId_semesterId_idx" ON "Assignment"("courseId", "semesterId");
CREATE INDEX "Assignment_submittedById_idx" ON "Assignment"("submittedById");
CREATE INDEX "Assignment_submittedAt_idx" ON "Assignment"("submittedAt");
CREATE INDEX "Assignment_type_idx" ON "Assignment"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
