// Central authorization primitives — assignment layer.
//
// REDESIGNED for the student-originated Assignment model: there is no
// staff-authored prompt to "submit to" anymore, so canSubmitAssignment
// (which checked an Assignment's publishedAt) is gone — a student
// creates their own Assignment record directly; the only gate is whether
// they're allowed to create content in that course at all, same as any
// other eligibility check. canGenerateFromSubmission and
// canReceiveDistribution are unchanged in spirit, just querying the
// unified Assignment model now instead of a separate AssignmentSubmission.
import { db } from '$lib/server/db';
import { canAccessCourse } from './course';

/**
 * True iff `recipientStudentId` is an eligible recipient of a distributed
 * assignment's study material for this course/semester — i.e. paid +
 * enrolled, same as any other content. Kept as its own named function
 * (rather than callers just reusing canAccessCourse directly) because
 * it's called from two different places that must never drift apart: the
 * eligible-recipients picker (GET) and the actual distribute write (POST)
 * — both must use the exact same predicate, or a picker/write mismatch
 * becomes a real eligibility bug.
 */
export async function canReceiveDistribution(
	recipientStudentId: string,
	courseId: string,
	semesterId: string
): Promise<boolean> {
	return canAccessCourse(recipientStudentId, courseId, semesterId);
}

/**
 * True iff generating study material from `assignment` (and, by extension,
 * distributing it — the same gate applies to both) is available at all.
 *
 * Per direct product decision: "generate and share is only for a group" —
 * an INDIVIDUAL assignment still gets its rawText extracted and a pdfUrl
 * rendered at creation (same pipeline as a GROUP one), but has no
 * generate/distribute action. Checked here, once, so
 * POST /submissions/:id/generate and POST /submissions/:id/distribute
 * (and their matching GET /eligible-recipients) can't drift apart on this
 * rule.
 */
export async function canGenerateFromSubmission(assignmentId: string): Promise<boolean> {
	const assignment = await db.assignment.findUnique({
		where: { id: assignmentId },
		select: { type: true }
	});
	return assignment?.type === 'GROUP';
}
