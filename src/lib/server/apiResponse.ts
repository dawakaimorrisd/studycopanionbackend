// Every /api/v1/** route returns errors in this shape — { error: { code,
// message } } — so the Frontend app can branch on `code` rather than
// parsing message strings. See build plan §7.
import { json } from '@sveltejs/kit';

export function apiError(status: number, code: string, message: string): Response {
	return json({ error: { code, message } }, { status });
}

export const API_ERRORS = {
	notAuthenticated: () => apiError(401, 'not_authenticated', 'Sign in required.'),
	notAStudent: () => apiError(403, 'not_a_student', 'This endpoint is for student accounts only.'),
	notAnInstructor: () =>
		apiError(403, 'not_an_instructor', 'This endpoint is for instructor accounts only.'),
	notFound: (what: string) => apiError(404, 'not_found', `${what} not found.`),
	noAccess: (what: string) => apiError(403, 'no_access', `You don't have access to this ${what}.`),
	badRequest: (message: string) => apiError(400, 'bad_request', message),
	conflict: (message: string) => apiError(409, 'conflict', message),
	rateLimited: (retryAfterSeconds: number) =>
		apiError(429, 'rate_limited', `Too many attempts. Try again in ${retryAfterSeconds}s.`),
	internal: () => apiError(500, 'internal_error', 'Something went wrong. Please try again.')
};
