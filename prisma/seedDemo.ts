// Run with `npm run seed:demo`. Separate from `prisma/seed.ts` (which only
// creates the one required Admin account) — this creates a full demo
// dataset: a Semester (created and activated), a college, a course, a
// Moderator and an Instructor account (both with paid semester access), a
// few students (enrolled + paid), a Note with hand-seeded question units
// (no real Groq call — this is for exercising the console/API, not testing
// generation itself), two demo Assignments (one INDIVIDUAL, one GROUP —
// generated and distributed to a classmate), and StudySession rows placed
// deliberately in each of the three engagement buckets, so Phase 7's
// dashboard has something real to show immediately. Safe to re-run — skips
// anything by that name that already exists rather than duplicating it.
//
// REWRITTEN twice: first for Phase 10+ (Semester/payment/enrollment —
// previously targeted the Phase 0-9 schema directly), then again for the
// unified, student-originated Assignment model (see schema.prisma's
// Assignment comment) — Assignments below are seeded as if a student
// uploaded their own homework, not as a staff-created prompt; there is no
// more `uploadedByStaffId`/`publishedAt` on Assignment at all.
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const db = new PrismaClient();

async function upsertSemester(name: string) {
	const existing = await db.semester.findFirst({ where: { name } });
	if (existing) return existing;
	const now = new Date();
	const semester = await db.semester.create({
		data: {
			name,
			startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
			endDate: new Date(now.getFullYear(), now.getMonth() + 4, 0),
			isActive: false
		}
	});
	// activateSemester's atomic deactivate-then-activate isn't imported here
	// (this is a standalone script, not a request handler) — replicated
	// inline since there's no rollover concern on a fresh seed (nothing to
	// roll forward from).
	await db.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
	return db.semester.update({ where: { id: semester.id }, data: { isActive: true } });
}

async function upsertCollege(name: string) {
	const existing = await db.college.findFirst({ where: { name } });
	if (existing) return existing;
	return db.college.create({ data: { name } });
}

async function upsertCourse(name: string, courseCode: string, collegeId: string) {
	const existing = await db.course.findUnique({ where: { courseCode } });
	if (existing) return existing;
	const course = await db.course.create({ data: { name, courseCode } });
	await db.courseCollege.create({ data: { courseId: course.id, collegeId } });
	return course;
}

async function upsertStaff(name: string, role: 'MODERATOR' | 'INSTRUCTOR', password: string) {
	const existing = await db.staffUser.findFirst({ where: { name, role } });
	if (existing) return existing;
	const passwordHash = await argon2.hash(password);
	return db.staffUser.create({ data: { name, role, passwordHash } });
}

async function upsertStudent(name: string, studentCode: string, collegeId: string, password: string) {
	const existing = await db.student.findUnique({ where: { studentCode } });
	if (existing) return existing;
	const passwordHash = await argon2.hash(password);
	return db.student.create({ data: { name, studentCode, collegeId, passwordHash } });
}

/** Enrolls a student in the semester + course, and marks their semester access paid — the two things that together make content visible to them. */
async function enrollAndActivate(studentId: string, semesterId: string, courseId: string, collegeId: string) {
	const studentSemester = await db.studentSemester.upsert({
		where: { studentId_semesterId: { studentId, semesterId } },
		update: {},
		create: { studentId, semesterId, collegeId }
	});
	await db.studentCourse.upsert({
		where: { studentId_courseId_semesterId: { studentId, courseId, semesterId } },
		update: {},
		create: { studentSemesterId: studentSemester.id, studentId, courseId, semesterId }
	});
	await db.studentSemesterAccess.upsert({
		where: { studentId_semesterId: { studentId, semesterId } },
		update: { isPaid: true },
		create: { studentId, semesterId, isPaid: true, amountPaidCents: 0, paidAt: new Date(), activatedAt: new Date() }
	});
}

function daysAgo(n: number, secondsOffset = 0): Date {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000 - secondsOffset * 1000);
}

async function main() {
	console.log('Seeding demo data...');

	const semester = await upsertSemester('Demo Semester');
	const college = await upsertCollege('College of Health Science and Midwifery (Demo)');
	const course = await upsertCourse('Anatomy I (Demo)', 'DEMO-ANAT101', college.id);

	const moderator = await upsertStaff('Demo Moderator', 'MODERATOR', 'demo-password-123');
	const instructor = await upsertStaff('Demo Instructor', 'INSTRUCTOR', 'demo-password-123');

	await db.instructorCourse.upsert({
		where: { instructorId_courseId_semesterId: { instructorId: instructor.id, courseId: course.id, semesterId: semester.id } },
		update: {},
		create: { instructorId: instructor.id, courseId: course.id, semesterId: semester.id }
	});
	await db.instructorSemesterAccess.upsert({
		where: { instructorId_semesterId: { instructorId: instructor.id, semesterId: semester.id } },
		update: { isPaid: true },
		create: {
			instructorId: instructor.id,
			semesterId: semester.id,
			isPaid: true,
			amountPaidCents: 0,
			paidAt: new Date(),
			activatedAt: new Date()
		}
	});

	const engagedStudent = await upsertStudent('Engaged Student', 'DEMO-S001', college.id, 'demo-password-123');
	const moderateStudent = await upsertStudent('Moderate Student', 'DEMO-S002', college.id, 'demo-password-123');
	const atRiskStudent = await upsertStudent('At-Risk Student', 'DEMO-S003', college.id, 'demo-password-123');
	const neverOpenedStudent = await upsertStudent(
		'Never-Opened Student',
		'DEMO-S004',
		college.id,
		'demo-password-123'
	);

	for (const student of [engagedStudent, moderateStudent, atRiskStudent, neverOpenedStudent]) {
		await enrollAndActivate(student.id, semester.id, course.id, college.id);
	}

	let note = await db.note.findFirst({ where: { courseId: course.id, semesterId: semester.id, title: 'Cell Structure (Demo)' } });
	if (!note) {
		note = await db.note.create({
			data: {
				courseId: course.id,
				semesterId: semester.id,
				title: 'Cell Structure (Demo)',
				chapterLabel: 'Chapter 1',
				rawText:
					'The cell is the basic structural and functional unit of life. Eukaryotic cells contain a nucleus, mitochondria, and other membrane-bound organelles...',
				uploadedByStaffId: moderator.id,
				generatedAt: new Date(),
				// Publication (not a grant) is what makes this visible to
				// enrolled + paid students — see enrollAndActivate above.
				publishedAt: new Date(),
				publishedByStaffId: moderator.id,
				// v9 (Phase 9): hand-seeded in the MCQ shape directly, same as
				// before — no real Groq call — this exercises the
				// console/API's MCQ rendering and the chapter-test workflow, not
				// generation itself.
				questionUnits: {
					create: [
						{
							sourceType: 'NOTE',
							order: 0,
							question: 'What is the basic structural and functional unit of life?',
							optionA: 'The cell',
							optionB: 'The tissue',
							optionC: 'The organ',
							optionD: 'The atom',
							correctOption: 'A',
							explanation:
								'Every living organism is composed of one or more cells, and all of an organism\'s functions occur within cells — larger structures like tissues and organs are built from them.',
							dictionaryEntries: {
								create: [
									{
										term: 'Eukaryotic',
										definition: 'Having cells with a membrane-bound nucleus.',
										example: 'Animal, plant, and fungal cells are all eukaryotic.'
									}
								]
							}
						},
						{
							sourceType: 'NOTE',
							order: 1,
							question: 'Which two membrane-bound organelles are named as present in eukaryotic cells?',
							optionA: 'The ribosome and lysosome',
							optionB: 'The nucleus and mitochondria',
							optionC: 'The vacuole and centriole',
							optionD: 'The flagellum and cilium',
							correctOption: 'B',
							explanation:
								'The passage specifically names the nucleus and mitochondria as membrane-bound organelles found in eukaryotic cells.'
						}
					]
				}
			}
		});
		console.log(`Created demo Note "${note.title}" with 2 MCQ question units.`);
	}

	// Assignments are student-authored now (see schema.prisma's Assignment
	// comment) — seeded here as if moderateStudent/engagedStudent actually
	// uploaded their own homework, not as a staff-created prompt. One
	// INDIVIDUAL (no generate/distribute available for it, by design) and
	// one GROUP (generated + distributed, to exercise that whole flow in a
	// fresh clone without clicking through it manually first).
	let individualAssignment = await db.assignment.findFirst({
		where: { courseId: course.id, semesterId: semester.id, title: 'Short Answer: Cell Function (Demo)' }
	});
	if (!individualAssignment) {
		individualAssignment = await db.assignment.create({
			data: {
				courseId: course.id,
				semesterId: semester.id,
				submittedById: moderateStudent.id,
				type: 'INDIVIDUAL',
				title: 'Short Answer: Cell Function (Demo)',
				fileUrl: '/uploads/studycompanion/demo-placeholder.pdf',
				fileName: 'demo-placeholder.pdf',
				fileMimeType: 'application/pdf',
				rawText: 'Describe, in your own words, the function of the mitochondria within a eukaryotic cell.'
				// pdfUrl deliberately left null — this script writes rows
				// directly rather than going through the real upload endpoint,
				// so the PDF-rendering step (lib/server/pdfConversion.ts) never
				// runs. A real student upload always gets a real pdfUrl; this
				// hand-seeded one just won't have one to open.
			}
		});
		console.log(`Created demo INDIVIDUAL Assignment submitted by ${moderateStudent.name} (no pdfUrl — see comment).`);
	}

	let groupAssignment = await db.assignment.findFirst({
		where: { courseId: course.id, semesterId: semester.id, title: 'Group Report: Cell Division (Demo)' }
	});
	if (!groupAssignment) {
		groupAssignment = await db.assignment.create({
			data: {
				courseId: course.id,
				semesterId: semester.id,
				submittedById: engagedStudent.id,
				type: 'GROUP',
				groupName: 'Group 1 (Demo)',
				title: 'Group Report: Cell Division (Demo)',
				fileUrl: '/uploads/studycompanion/demo-placeholder.pdf',
				fileName: 'demo-placeholder.pdf',
				fileMimeType: 'application/pdf',
				rawText:
					'Mitosis produces two genetically identical daughter cells and proceeds through prophase, metaphase, anaphase, and telophase.',
				generatedAt: new Date(),
				members: { create: [{ studentId: atRiskStudent.id }] },
				questionUnits: {
					create: [
						{
							sourceType: 'ASSIGNMENT',
							order: 0,
							question: 'Which phase of mitosis is described by chromosomes lining up at the cell equator?',
							optionA: 'Prophase',
							optionB: 'Metaphase',
							optionC: 'Anaphase',
							optionD: 'Telophase',
							correctOption: 'B',
							explanation: 'Metaphase is defined by chromosomes aligning along the metaphase plate before separation.'
						}
					]
				}
			}
		});
		console.log(
			`Created demo GROUP Assignment "${groupAssignment.title}" (${engagedStudent.name} + ${atRiskStudent.name}, generated, no pdfUrl — see comment).`
		);

		const distribution = await db.assignmentDistribution.create({
			data: { assignmentId: groupAssignment.id, sentById: engagedStudent.id }
		});
		await db.assignmentDistributionRecipient.create({
			data: { distributionId: distribution.id, studentId: neverOpenedStudent.id }
		});
		console.log(`Distributed the demo GROUP Assignment to ${neverOpenedStudent.name}.`);
	}

	// StudySession rows placed to land each student in a different
	// engagement bucket (see lib/server/analytics/engagement.ts for the
	// thresholds). endedAt is set (these are all "completed" sessions, per
	// the Start/End Study model) — durationSeconds is what analytics
	// actually reads, endedAt/startedAt are supplementary.
	await db.studySession.create({
		data: {
			studentId: engagedStudent.id,
			semesterId: semester.id,
			courseId: course.id,
			chapterId: note.chapterId,
			noteId: note.id,
			durationSeconds: 900,
			startedAt: daysAgo(2, 900),
			endedAt: daysAgo(2)
		}
	});
	await db.studySession.create({
		data: {
			studentId: moderateStudent.id,
			semesterId: semester.id,
			courseId: course.id,
			chapterId: note.chapterId,
			noteId: note.id,
			durationSeconds: 600,
			startedAt: daysAgo(14, 600),
			endedAt: daysAgo(14)
		}
	});
	await db.studySession.create({
		data: {
			studentId: atRiskStudent.id,
			semesterId: semester.id,
			courseId: course.id,
			chapterId: note.chapterId,
			noteId: note.id,
			durationSeconds: 300,
			startedAt: daysAgo(40, 300),
			endedAt: daysAgo(40)
		}
	});
	// neverOpenedStudent gets no StudySession at all — enrolled and paid,
	// never studied.

	// v9 (Phase 9): exercise the full chapter-test workflow — instructor
	// starts it, one student submits (one right, one wrong), instructor
	// reveals. This is what a fresh clone will see immediately at
	// /console/notes/<id> and via the Instructor "my students" API, without
	// needing to click through the flow manually first.
	const questionUnits = await db.questionUnit.findMany({ where: { noteId: note.id }, orderBy: { order: 'asc' } });
	if (!note.testStartedAt) {
		await db.note.update({ where: { id: note.id }, data: { testStartedAt: daysAgo(1) } });
	}
	const existingAttempt = await db.noteTestAttempt.findUnique({
		where: { studentId_noteId: { studentId: engagedStudent.id, noteId: note.id } }
	});
	if (!existingAttempt && questionUnits.length === 2) {
		await db.noteTestAttempt.create({
			data: {
				studentId: engagedStudent.id,
				noteId: note.id,
				score: 1,
				submittedAt: daysAgo(1),
				answers: {
					create: [
						{
							questionUnitId: questionUnits[0].id,
							selectedOption: questionUnits[0].correctOption,
							isCorrect: true
						},
						{
							// Deliberately wrong, so the demo score isn't a trivial 100%.
							questionUnitId: questionUnits[1].id,
							selectedOption: questionUnits[1].correctOption === 'A' ? 'B' : 'A',
							isCorrect: false
						}
					]
				}
			}
		});
		console.log(`Recorded a demo test attempt for ${engagedStudent.name} (score 1/2).`);
	}
	if (!note.testRevealedAt) {
		await db.note.update({ where: { id: note.id }, data: { testRevealedAt: new Date() } });
	}

	console.log('\nDemo data ready:');
	console.log(`  Semester:   ${semester.name} (active)`);
	console.log(`  College:    ${college.name}`);
	console.log(`  Course:     ${course.name} (${course.courseCode})`);
	console.log(`  Moderator:  ${moderator.name} / demo-password-123`);
	console.log(`  Instructor: ${instructor.name} / demo-password-123 (paid, assigned to ${course.courseCode})`);
	console.log('  Students (all password demo-password-123, all enrolled + paid):');
	console.log(`    ${engagedStudent.studentCode} — should show "Engaged"`);
	console.log(`    ${moderateStudent.studentCode} — should show "Moderate"`);
	console.log(`    ${atRiskStudent.studentCode} — should show "At-risk" (studied 40 days ago)`);
	console.log(`    ${neverOpenedStudent.studentCode} — should show "At-risk" (never opened)`);
	console.log('\nVisit /console/progress/<courseId> to see all four classified correctly.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
