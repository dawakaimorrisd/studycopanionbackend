// POST /api/v1/students/me/submissions/:id/distribute
//
// Body: { recipientStudentIds: string[] }. Every recipient is re-validated
// server-side with canReceiveDistribution AT WRITE TIME — never trust a
// client-filtered list built from an earlier GET /eligible-recipients call,
// since the two requests aren't atomic and a classmate's access could have
// lapsed in between. An Assignment does NOT auto-broadcast to the whole
// course on creation — this explicit action is required, and can be
// called more than once (each call creates a new AssignmentDistribution
// "send" — there's no dedup against a previous send to the same person;
// sending twice just means two AssignmentDistributionRecipient rows exist
// for that pairing, which is harmless and not worth guarding against).
// `:id` is the Assignment's own id (unified model — see schema.prisma).
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { canReceiveDistribution, canGenerateFromSubmission } from '$lib/server/access/assignment';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	recipientStudentIds: z.array(z.string().min(1)).min(1, 'Select at least one recipient.')
});

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		select: { id: true, submittedById: true, generatedAt: true, courseId: true, semesterId: true }
	});
	if (!assignment) return API_ERRORS.notFound('Assignment');
	if (assignment.submittedById !== locals.student.id) return API_ERRORS.noAccess('assignment');

	if (!(await canGenerateFromSubmission(assignment.id))) {
		return API_ERRORS.badRequest('Sending study material is only available for group assignments.');
	}
	if (!assignment.generatedAt) {
		return API_ERRORS.badRequest('Generate study material from this assignment before sending it.');
	}

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const validRecipientIds: string[] = [];
	for (const studentId of parsed.data.recipientStudentIds) {
		if (studentId === locals.student.id) continue; // can't send to yourself
		const eligible = await canReceiveDistribution(studentId, assignment.courseId, assignment.semesterId);
		if (eligible) validRecipientIds.push(studentId);
	}

	if (validRecipientIds.length === 0) {
		return API_ERRORS.badRequest('None of the selected recipients are currently eligible.');
	}

	const distribution = await db.$transaction(async (tx) => {
		const created = await tx.assignmentDistribution.create({
			data: { assignmentId: assignment.id, sentById: locals.student!.id }
		});
		await tx.assignmentDistributionRecipient.createMany({
			data: validRecipientIds.map((studentId) => ({ distributionId: created.id, studentId }))
		});
		return created;
	});

	return json(
		{
			id: distribution.id,
			sentCount: validRecipientIds.length,
			skippedCount: parsed.data.recipientStudentIds.length - validRecipientIds.length
		},
		{ status: 201 }
	);
};
