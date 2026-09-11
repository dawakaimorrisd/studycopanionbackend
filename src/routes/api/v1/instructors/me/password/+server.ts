// POST /api/v1/instructors/me/password — Instructor-only. Same gap and same
// rationale as students/me/password — an Instructor's password is set by an
// Admin at account creation; there was no self-service way to change it
// afterward.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { verifyPassword, hashPassword } from '$lib/server/auth/password';
import { API_ERRORS } from '$lib/server/apiResponse';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	currentPassword: z.string().min(1, 'Current password is required.'),
	newPassword: z.string().min(8, 'New password must be at least 8 characters.')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.staff) return API_ERRORS.notAuthenticated();
	if (locals.staff.role !== 'INSTRUCTOR') return API_ERRORS.notAnInstructor();

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const valid = await verifyPassword(locals.staff.passwordHash, parsed.data.currentPassword);
	if (!valid) return API_ERRORS.badRequest('Current password is incorrect.');

	const passwordHash = await hashPassword(parsed.data.newPassword);
	await db.staffUser.update({ where: { id: locals.staff.id }, data: { passwordHash } });

	const authHeader = request.headers.get('authorization');
	const currentToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
	await db.session.deleteMany({
		where: { staffId: locals.staff.id, ...(currentToken ? { id: { not: currentToken } } : {}) }
	});

	return json({ changed: true });
};
