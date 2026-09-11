// POST /api/v1/students/me/password — Student-only. Gap found during a
// Phase 9 audit: there was no way for a student to change their own
// password at all after signup — a real problem given the frontend needs
// a genuine "account management" page, and only gets more important once
// bulk-created accounts with a shared starting password exist (see the
// Semester/access-model discussion — not built yet, but this endpoint is
// needed regardless of whether that ships).
//
// Requires the current password, not just a logged-in session — changing a
// password is exactly the kind of action worth re-confirming identity for,
// even though the session itself already proves "logged in."
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
	if (!locals.student) return API_ERRORS.notAuthenticated();

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return API_ERRORS.badRequest(parsed.error.issues[0].message);

	const valid = await verifyPassword(locals.student.passwordHash, parsed.data.currentPassword);
	if (!valid) return API_ERRORS.badRequest('Current password is incorrect.');

	const passwordHash = await hashPassword(parsed.data.newPassword);
	await db.student.update({ where: { id: locals.student.id }, data: { passwordHash } });

	// Sign out everywhere else, but keep the session making this request
	// valid — no reason to force a student to immediately re-log-in on the
	// device they just used to change their password.
	const authHeader = request.headers.get('authorization');
	const currentToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
	await db.studentSession.deleteMany({
		where: { studentId: locals.student.id, ...(currentToken ? { id: { not: currentToken } } : {}) }
	});

	return json({ changed: true });
};
