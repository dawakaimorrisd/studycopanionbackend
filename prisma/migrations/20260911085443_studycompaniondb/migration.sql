-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" TEXT,
    CONSTRAINT "College_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" TEXT,
    CONSTRAINT "Course_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseCollege" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    CONSTRAINT "CourseCollege_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseCollege_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "InstructorCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructorId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstructorCourse_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstructorCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstructorCourse_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Student_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentSemester" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSemester_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSemester_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSemester_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentSemesterId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentCourse_studentSemesterId_fkey" FOREIGN KEY ("studentSemesterId") REFERENCES "StudentSemester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentCourse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentCourse_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentSemesterAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "amountPaidCents" INTEGER,
    "paidAt" DATETIME,
    "activatedAt" DATETIME,
    "activatedById" TEXT,
    "revokedAt" DATETIME,
    "revokedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentSemesterAccess_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSemesterAccess_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSemesterAccess_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstructorSemesterAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructorId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "amountPaidCents" INTEGER,
    "paidAt" DATETIME,
    "activatedAt" DATETIME,
    "activatedById" TEXT,
    "revokedAt" DATETIME,
    "revokedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstructorSemesterAccess_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstructorSemesterAccess_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstructorSemesterAccess_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semesterId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "note" TEXT,
    CONSTRAINT "AccessPayment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccessPayment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccessPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseChapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseChapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseChapter_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT,
    "chapterLabel" TEXT,
    "rawText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" DATETIME,
    "generationError" TEXT,
    "publishedAt" DATETIME,
    "publishedByStaffId" TEXT,
    "testStartedAt" DATETIME,
    "testRevealedAt" DATETIME,
    "uploadedByStaffId" TEXT,
    "sourceFileUrl" TEXT,
    "sourceFileName" TEXT,
    "sourceFileMimeType" TEXT,
    CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Note_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Note_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_uploadedByStaffId_fkey" FOREIGN KEY ("uploadedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_publishedByStaffId_fkey" FOREIGN KEY ("publishedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "groupName" TEXT,
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

-- CreateTable
CREATE TABLE "AssignmentMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentMember_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssignmentDistribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentDistribution_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentDistribution_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssignmentDistributionRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "distributionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentDistributionRecipient_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "AssignmentDistribution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentDistributionRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "optionA" TEXT NOT NULL,
    "optionB" TEXT NOT NULL,
    "optionC" TEXT NOT NULL,
    "optionD" TEXT NOT NULL,
    "correctOption" TEXT NOT NULL,
    "explanation" TEXT,
    "isTable" BOOLEAN NOT NULL DEFAULT false,
    "noteId" TEXT,
    "assignmentId" TEXT,
    CONSTRAINT "QuestionUnit_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QuestionUnit_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "questionUnitId" TEXT NOT NULL,
    CONSTRAINT "DictionaryEntry_questionUnitId_fkey" FOREIGN KEY ("questionUnitId") REFERENCES "QuestionUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteTestAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    CONSTRAINT "NoteTestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NoteTestAttempt_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteTestAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionUnitId" TEXT NOT NULL,
    "selectedOption" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    CONSTRAINT "NoteTestAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "NoteTestAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NoteTestAnswer_questionUnitId_fkey" FOREIGN KEY ("questionUnitId") REFERENCES "QuestionUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT,
    "noteId" TEXT,
    "assignmentId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL,
    CONSTRAINT "StudySession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudySession_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudySession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudySession_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudySession_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudySession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionDrillAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "score" INTEGER,
    CONSTRAINT "DistributionDrillAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DistributionDrillAttempt_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "AssignmentDistribution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionDrillAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionUnitId" TEXT NOT NULL,
    "selectedOption" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    CONSTRAINT "DistributionDrillAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DistributionDrillAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DistributionDrillAnswer_questionUnitId_fkey" FOREIGN KEY ("questionUnitId") REFERENCES "QuestionUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Semester_isActive_idx" ON "Semester"("isActive");

-- CreateIndex
CREATE INDEX "Semester_startDate_endDate_idx" ON "Semester"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "College_createdByStaffId_idx" ON "College"("createdByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_courseCode_key" ON "Course"("courseCode");

-- CreateIndex
CREATE INDEX "Course_createdByStaffId_idx" ON "Course"("createdByStaffId");

-- CreateIndex
CREATE INDEX "CourseCollege_collegeId_idx" ON "CourseCollege"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCollege_courseId_collegeId_key" ON "CourseCollege"("courseId", "collegeId");

-- CreateIndex
CREATE INDEX "StaffUser_role_idx" ON "StaffUser"("role");

-- CreateIndex
CREATE INDEX "InstructorCourse_instructorId_semesterId_idx" ON "InstructorCourse"("instructorId", "semesterId");

-- CreateIndex
CREATE INDEX "InstructorCourse_courseId_semesterId_idx" ON "InstructorCourse"("courseId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorCourse_instructorId_courseId_semesterId_key" ON "InstructorCourse"("instructorId", "courseId", "semesterId");

-- CreateIndex
CREATE INDEX "Session_staffId_idx" ON "Session"("staffId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentCode_key" ON "Student"("studentCode");

-- CreateIndex
CREATE INDEX "Student_collegeId_idx" ON "Student"("collegeId");

-- CreateIndex
CREATE INDEX "StudentSession_studentId_idx" ON "StudentSession"("studentId");

-- CreateIndex
CREATE INDEX "StudentSession_expiresAt_idx" ON "StudentSession"("expiresAt");

-- CreateIndex
CREATE INDEX "StudentSemester_semesterId_idx" ON "StudentSemester"("semesterId");

-- CreateIndex
CREATE INDEX "StudentSemester_collegeId_idx" ON "StudentSemester"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSemester_studentId_semesterId_key" ON "StudentSemester"("studentId", "semesterId");

-- CreateIndex
CREATE INDEX "StudentCourse_studentSemesterId_idx" ON "StudentCourse"("studentSemesterId");

-- CreateIndex
CREATE INDEX "StudentCourse_studentId_semesterId_idx" ON "StudentCourse"("studentId", "semesterId");

-- CreateIndex
CREATE INDEX "StudentCourse_courseId_semesterId_idx" ON "StudentCourse"("courseId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourse_studentId_courseId_semesterId_key" ON "StudentCourse"("studentId", "courseId", "semesterId");

-- CreateIndex
CREATE INDEX "StudentSemesterAccess_semesterId_isPaid_idx" ON "StudentSemesterAccess"("semesterId", "isPaid");

-- CreateIndex
CREATE INDEX "StudentSemesterAccess_studentId_idx" ON "StudentSemesterAccess"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSemesterAccess_studentId_semesterId_key" ON "StudentSemesterAccess"("studentId", "semesterId");

-- CreateIndex
CREATE INDEX "InstructorSemesterAccess_semesterId_isPaid_idx" ON "InstructorSemesterAccess"("semesterId", "isPaid");

-- CreateIndex
CREATE INDEX "InstructorSemesterAccess_instructorId_idx" ON "InstructorSemesterAccess"("instructorId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorSemesterAccess_instructorId_semesterId_key" ON "InstructorSemesterAccess"("instructorId", "semesterId");

-- CreateIndex
CREATE INDEX "AccessPayment_semesterId_idx" ON "AccessPayment"("semesterId");

-- CreateIndex
CREATE INDEX "AccessPayment_studentId_idx" ON "AccessPayment"("studentId");

-- CreateIndex
CREATE INDEX "AccessPayment_instructorId_idx" ON "AccessPayment"("instructorId");

-- CreateIndex
CREATE INDEX "AccessPayment_recordedAt_idx" ON "AccessPayment"("recordedAt");

-- CreateIndex
CREATE INDEX "CourseChapter_courseId_semesterId_idx" ON "CourseChapter"("courseId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseChapter_courseId_semesterId_order_key" ON "CourseChapter"("courseId", "semesterId", "order");

-- CreateIndex
CREATE INDEX "Note_courseId_semesterId_idx" ON "Note"("courseId", "semesterId");

-- CreateIndex
CREATE INDEX "Note_chapterId_idx" ON "Note"("chapterId");

-- CreateIndex
CREATE INDEX "Note_semesterId_publishedAt_idx" ON "Note"("semesterId", "publishedAt");

-- CreateIndex
CREATE INDEX "Note_uploadedByStaffId_idx" ON "Note"("uploadedByStaffId");

-- CreateIndex
CREATE INDEX "Assignment_courseId_semesterId_idx" ON "Assignment"("courseId", "semesterId");

-- CreateIndex
CREATE INDEX "Assignment_submittedById_idx" ON "Assignment"("submittedById");

-- CreateIndex
CREATE INDEX "Assignment_submittedAt_idx" ON "Assignment"("submittedAt");

-- CreateIndex
CREATE INDEX "Assignment_type_idx" ON "Assignment"("type");

-- CreateIndex
CREATE INDEX "AssignmentMember_studentId_idx" ON "AssignmentMember"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentMember_assignmentId_studentId_key" ON "AssignmentMember"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "AssignmentDistribution_assignmentId_idx" ON "AssignmentDistribution"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentDistribution_sentById_idx" ON "AssignmentDistribution"("sentById");

-- CreateIndex
CREATE INDEX "AssignmentDistribution_sentAt_idx" ON "AssignmentDistribution"("sentAt");

-- CreateIndex
CREATE INDEX "AssignmentDistributionRecipient_studentId_idx" ON "AssignmentDistributionRecipient"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentDistributionRecipient_distributionId_studentId_key" ON "AssignmentDistributionRecipient"("distributionId", "studentId");

-- CreateIndex
CREATE INDEX "QuestionUnit_noteId_idx" ON "QuestionUnit"("noteId");

-- CreateIndex
CREATE INDEX "QuestionUnit_assignmentId_idx" ON "QuestionUnit"("assignmentId");

-- CreateIndex
CREATE INDEX "QuestionUnit_sourceType_idx" ON "QuestionUnit"("sourceType");

-- CreateIndex
CREATE INDEX "DictionaryEntry_questionUnitId_idx" ON "DictionaryEntry"("questionUnitId");

-- CreateIndex
CREATE INDEX "NoteTestAttempt_studentId_idx" ON "NoteTestAttempt"("studentId");

-- CreateIndex
CREATE INDEX "NoteTestAttempt_noteId_idx" ON "NoteTestAttempt"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTestAttempt_studentId_noteId_key" ON "NoteTestAttempt"("studentId", "noteId");

-- CreateIndex
CREATE INDEX "NoteTestAnswer_attemptId_idx" ON "NoteTestAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "NoteTestAnswer_questionUnitId_idx" ON "NoteTestAnswer"("questionUnitId");

-- CreateIndex
CREATE INDEX "StudySession_studentId_semesterId_idx" ON "StudySession"("studentId", "semesterId");

-- CreateIndex
CREATE INDEX "StudySession_courseId_semesterId_idx" ON "StudySession"("courseId", "semesterId");

-- CreateIndex
CREATE INDEX "StudySession_chapterId_idx" ON "StudySession"("chapterId");

-- CreateIndex
CREATE INDEX "StudySession_noteId_idx" ON "StudySession"("noteId");

-- CreateIndex
CREATE INDEX "StudySession_assignmentId_idx" ON "StudySession"("assignmentId");

-- CreateIndex
CREATE INDEX "StudySession_startedAt_idx" ON "StudySession"("startedAt");

-- CreateIndex
CREATE INDEX "DistributionDrillAttempt_studentId_idx" ON "DistributionDrillAttempt"("studentId");

-- CreateIndex
CREATE INDEX "DistributionDrillAttempt_distributionId_idx" ON "DistributionDrillAttempt"("distributionId");

-- CreateIndex
CREATE INDEX "DistributionDrillAnswer_attemptId_idx" ON "DistributionDrillAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "DistributionDrillAnswer_questionUnitId_idx" ON "DistributionDrillAnswer"("questionUnitId");
