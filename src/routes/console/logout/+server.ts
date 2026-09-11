import { redirect } from '@sveltejs/kit';
import { invalidateStaffSession } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

const SESSION_COOKIE = 'session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await invalidateStaffSession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	throw redirect(303, '/console/login');
};
