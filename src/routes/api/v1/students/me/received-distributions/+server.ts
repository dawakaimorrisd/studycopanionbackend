// GET /api/v1/students/me/received-distributions — what's been shared with
// this student via the distribute flow. Access is inherent — if an
// AssignmentDistributionRecipient row exists for you, you received it; no
// separate eligibility re-check is needed to read something already
// explicitly sent to you.
//
// GATED — this used to send correctOption/explanation fully revealed,
// unconditionally, which was cosmetic-only on the Frontend (anyone with
// dev tools open could see every answer immediately regardless of UI
// state). Gated behind the student's MOST RECENT DistributionDrillAttempt
// on that specific distribution — see
// POST /students/me/distributions/:id/drill/start and .../submit.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const received = await db.assignmentDistributionRecipient.findMany({
		where: { studentId: locals.student.id },
		orderBy: { receivedAt: 'desc' },
		include: {
			distribution: {
				include: {
					sentBy: { select: { id: true, name: true, studentCode: true } },
					assignment: {
						select: {
							id: true,
							title: true,
							groupName: true,
							fileName: true,
							pdfUrl: true,
							pdfConversionError: true,
							course: { select: { name: true, courseCode: true } },
							questionUnits: { orderBy: { order: 'asc' }, include: { dictionaryEntries: true } }
						}
					}
				}
			}
		}
	});

	const distributionIds = received.map((r) => r.distribution.id);

	const [mostRecentAttempts, finishedCounts, bestAttempts] = await Promise.all([
		db.distributionDrillAttempt.findMany({
			where: { studentId: locals.student.id, distributionId: { in: distributionIds } },
			orderBy: { startedAt: 'desc' },
			select: { id: true, distributionId: true, startedAt: true, finishedAt: true }
		}),
		db.distributionDrillAttempt.groupBy({
			by: ['distributionId'],
			where: { studentId: locals.student.id, distributionId: { in: distributionIds }, finishedAt: { not: null } },
			_count: { _all: true }
		}),
		db.distributionDrillAttempt.findMany({
			where: { studentId: locals.student.id, distributionId: { in: distributionIds }, finishedAt: { not: null } },
			orderBy: { score: 'desc' },
			select: { distributionId: true, score: true }
		})
	]);

	// First occurrence per distributionId (already ordered startedAt desc)
	// is that student's most recent attempt on it.
	const mostRecentByDistribution = new Map<string, { id: string; finishedAt: Date | null }>();
	for (const attempt of mostRecentAttempts) {
		if (!mostRecentByDistribution.has(attempt.distributionId)) {
			mostRecentByDistribution.set(attempt.distributionId, attempt);
		}
	}
	const finishedCountByDistribution = new Map(finishedCounts.map((f) => [f.distributionId, f._count._all]));
	const bestScoreByDistribution = new Map<string, number>();
	for (const b of bestAttempts) {
		if (!bestScoreByDistribution.has(b.distributionId) && b.score !== null) {
			bestScoreByDistribution.set(b.distributionId, b.score);
		}
	}

	return json({
		distributions: received.map((r) => {
			const distributionId = r.distribution.id;
			const mostRecent = mostRecentByDistribution.get(distributionId);
			const revealed = Boolean(mostRecent?.finishedAt);
			const assignment = r.distribution.assignment;

			return {
				distributionId,
				receivedAt: r.receivedAt,
				sentBy: r.distribution.sentBy,
				assignment: {
					id: assignment.id,
					title: assignment.title,
					groupName: assignment.groupName,
					fileName: assignment.fileName,
					pdfUrl: assignment.pdfUrl,
					pdfConversionError: assignment.pdfConversionError,
					course: assignment.course
				},
				drills: {
					completedCount: finishedCountByDistribution.get(distributionId) ?? 0,
					inProgressAttemptId: mostRecent && !mostRecent.finishedAt ? mostRecent.id : null,
					bestScore: bestScoreByDistribution.get(distributionId) ?? null,
					totalQuestions: assignment.questionUnits.length
				},
				questionUnits: assignment.questionUnits.map((qu) => ({
					id: qu.id,
					order: qu.order,
					question: qu.question,
					optionA: qu.optionA,
					optionB: qu.optionB,
					optionC: qu.optionC,
					optionD: qu.optionD,
					correctOption: revealed ? qu.correctOption : null,
					explanation: revealed ? qu.explanation : null,
					isTable: qu.isTable,
					dictionaryEntries: qu.dictionaryEntries.map((d) => ({
						term: d.term,
						definition: d.definition,
						example: d.example
					}))
				}))
			};
		})
	});
};
