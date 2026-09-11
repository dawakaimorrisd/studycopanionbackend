// POST /api/v1/students/signup — one-time, manual, self-service. No
// pre-provisioned roster, no bulk import (see build plan §6/§9). Requires a
// valid collegeId — a student belongs to exactly one college, not to
// specific courses (the app doesn't track enrollment).
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
import { createStudentSession } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/rateLimit';
import { logger } from '$lib/server/logger';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const signupSchema = z.object({
	name: z.string().trim().min(2),
	studentCode: z.string().trim().min(2),
	password: z.string().min(8),
	collegeId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Tighter than login — signup creates a new account each time, so 5 per
	// hour per IP is plenty for a real student and blunts automated
	// account-creation abuse.
	const { allowed, retryAfterSeconds } = rateLimit(`signup:${getClientAddress()}`, 5, 60 * 60 * 1000);
	if (!allowed) return API_ERRORS.rateLimited(retryAfterSeconds);

	const body = await request.json().catch(() => null);
	const parsed = signupSchema.safeParse(body);
	if (!parsed.success) {
		return API_ERRORS.badRequest(parsed.error.issues[0].message);
	}

	const college = await db.college.findUnique({ where: { id: parsed.data.collegeId } });
	if (!college) return API_ERRORS.badRequest('Unknown college.');

	const existing = await db.student.findUnique({ where: { studentCode: parsed.data.studentCode } });
	if (existing) return API_ERRORS.conflict('That student code is already registered.');

	const passwordHash = await hashPassword(parsed.data.password);
	const student = await db.student.create({
		data: {
			name: parsed.data.name,
			studentCode: parsed.data.studentCode,
			passwordHash,
			collegeId: parsed.data.collegeId
		}
	});

	logger.info('student_signup_succeeded', { studentId: student.id, collegeId: college.id });

	const { token, expiresAt } = await createStudentSession(student.id);

	return json({
		token,
		expiresAt,
		student: { id: student.id, name: student.name, studentCode: student.studentCode }
	});
};
