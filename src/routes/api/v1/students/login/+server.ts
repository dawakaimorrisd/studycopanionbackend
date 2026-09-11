// POST /api/v1/students/login
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createStudentSession } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/rateLimit';
import { logger } from '$lib/server/logger';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const loginSchema = z.object({
	studentCode: z.string().trim().min(1),
	password: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const { allowed, retryAfterSeconds } = rateLimit(
		`student-login:${getClientAddress()}`,
		10,
		15 * 60 * 1000
	);
	if (!allowed) return API_ERRORS.rateLimited(retryAfterSeconds);

	const body = await request.json().catch(() => null);
	const parsed = loginSchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest('Enter your student code and password.');

	// Deliberately generic error either way — never confirm/deny whether a
	// student code exists.
	const genericError = API_ERRORS.badRequest('Incorrect student code or password.');

	const student = await db.student.findUnique({
		where: { studentCode: parsed.data.studentCode }
	});
	if (!student || student.deletedAt) {
		logger.warn('student_login_failed', { studentCode: parsed.data.studentCode });
		return genericError;
	}

	const valid = await verifyPassword(student.passwordHash, parsed.data.password);
	if (!valid) {
		logger.warn('student_login_failed', { studentCode: parsed.data.studentCode });
		return genericError;
	}

	logger.info('student_login_succeeded', { studentId: student.id });

	const { token, expiresAt } = await createStudentSession(student.id);

	return json({
		token,
		expiresAt,
		student: { id: student.id, name: student.name, studentCode: student.studentCode }
	});
};
