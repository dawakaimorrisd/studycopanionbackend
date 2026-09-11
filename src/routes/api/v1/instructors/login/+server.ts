// POST /api/v1/instructors/login — same underlying StaffUser/Session as the
// console, just bearer-token transport instead of a cookie (see build plan
// §3/§4). Rejects non-Instructor accounts explicitly — Admin/Moderator use
// the console, not this API.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createStaffSession } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/rateLimit';
import { logger } from '$lib/server/logger';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const loginSchema = z.object({
	name: z.string().trim().min(1),
	password: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const { allowed, retryAfterSeconds } = rateLimit(
		`instructor-login:${getClientAddress()}`,
		10,
		15 * 60 * 1000
	);
	if (!allowed) return API_ERRORS.rateLimited(retryAfterSeconds);

	const body = await request.json().catch(() => null);
	const parsed = loginSchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest('Enter your name and password.');

	const genericError = API_ERRORS.badRequest('Incorrect name or password.');

	const staff = await db.staffUser.findFirst({
		where: { name: parsed.data.name, role: 'INSTRUCTOR', deletedAt: null }
	});
	if (!staff) {
		logger.warn('instructor_login_failed', { name: parsed.data.name });
		return genericError;
	}

	const valid = await verifyPassword(staff.passwordHash, parsed.data.password);
	if (!valid) {
		logger.warn('instructor_login_failed', { name: parsed.data.name });
		return genericError;
	}

	logger.info('instructor_login_succeeded', { staffId: staff.id });

	const { token, expiresAt } = await createStaffSession(staff.id);

	return json({ token, expiresAt, instructor: { id: staff.id, name: staff.name } });
};
