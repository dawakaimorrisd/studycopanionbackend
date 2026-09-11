import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { verifyPassword } from '$lib/server/auth/password';
import { createStaffSession } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/rateLimit';
import { logger } from '$lib/server/logger';
import type { Actions } from './$types';

const loginSchema = z.object({
	role: z.enum(['ADMIN', 'MODERATOR']),
	name: z.string().min(1),
	password: z.string().min(1),
	next: z.string().optional()
});

const SESSION_COOKIE = 'session';

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		// 10 attempts per 15 minutes per IP — generous enough for a real
		// person who mistyped a password a few times, tight enough to blunt a
		// brute-force script.
		const { allowed, retryAfterSeconds } = rateLimit(
			`console-login:${getClientAddress()}`,
			10,
			15 * 60 * 1000
		);
		if (!allowed) {
			return fail(429, { error: `Too many attempts. Try again in ${retryAfterSeconds}s.` });
		}

		const formData = Object.fromEntries(await request.formData());
		const parsed = loginSchema.safeParse(formData);

		if (!parsed.success) {
			return fail(400, { error: 'Enter a name and password.' });
		}

		const { role, name, password, next } = parsed.data;

		// Deliberately generic error message either way — never confirm/deny
		// whether an account exists, and never say "wrong role selected" vs.
		// "wrong password" separately, since that leaks account existence too.
		const genericError = 'Incorrect name, password, or account type.';

		const staff = await db.staffUser.findFirst({ where: { name, deletedAt: null } });
		if (!staff || staff.role !== role) {
			logger.warn('staff_login_failed', { name, role, reason: 'no_matching_account' });
			return fail(400, { error: genericError });
		}

		const validPassword = await verifyPassword(staff.passwordHash, password);
		if (!validPassword) {
			logger.warn('staff_login_failed', { name, role, reason: 'bad_password' });
			return fail(400, { error: genericError });
		}

		const { token, expiresAt } = await createStaffSession(staff.id);
		logger.info('staff_login_succeeded', { staffId: staff.id, role: staff.role });

		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: expiresAt
		});

		throw redirect(303, next && next.startsWith('/console') ? next : '/console');
	}
};
