// Two auth transports, one session mechanism (see build plan §3/§4):
//   - /console/**  -> cookie, validated against Session (StaffUser)
//   - /api/v1/**   -> Authorization: Bearer <token>, validated against
//                     Session (Instructor) or StudentSession (Student)
// Console pages never go through /api/v1 — this hook just makes sure
// whichever route tree is being hit gets the right kind of locals set.
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { validateStaffSession, validateStudentSession } from '$lib/server/auth/session';
import { config } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { apiError } from '$lib/server/apiResponse';

const SESSION_COOKIE = 'session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.staff = null;
	event.locals.student = null;

	if (event.url.pathname.startsWith('/api/')) {
		// --- CORS preflight -----------------------------------------------
		const origin = event.request.headers.get('origin');
		if (event.request.method === 'OPTIONS') {
			const headers = new Headers();
			if (origin && config.frontendOrigins.includes(origin)) {
				headers.set('Access-Control-Allow-Origin', origin);
				headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
				headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
				headers.set('Vary', 'Origin');
			}
			return new Response(null, { status: 204, headers });
		}

		// --- Bearer-token auth for the separate Frontend app -----------------
		const authHeader = event.request.headers.get('authorization');
		const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

		if (token) {
			// A token could belong to either table — try staff (Instructor) first,
			// then student. Cheap: at most two indexed lookups, only on routes
			// that actually present a token.
			const staffSession = await validateStaffSession(token);
			if (staffSession) {
				event.locals.staff = staffSession.staff;
			} else {
				const studentSession = await validateStudentSession(token);
				if (studentSession) event.locals.student = studentSession.student;
			}
		}

		// Every /api/** route is expected to return a Response itself (either
		// json(...) or one of the API_ERRORS helpers). This catch is the
		// backstop for anything that throws instead — a bug, an unexpected
		// Prisma error, etc. — so an API consumer always gets the same
		// { error: { code, message } } JSON shape rather than SvelteKit's
		// default HTML error page, which would be a very confusing response
		// for a fetch() caller to receive.
		let response: Response;
		try {
			response = await resolve(event);
		} catch (err) {
			const errorId = randomUUID();
			logger.error('api_unhandled_exception', {
				errorId,
				path: event.url.pathname,
				method: event.request.method,
				message: err instanceof Error ? err.message : String(err)
			});
			response = apiError(500, 'internal_error', `Something went wrong (ref: ${errorId}).`);
		}

		// CORS: locked to the configured Frontend origin(s), not a wildcard,
		// since bearer tokens are involved.
		if (origin && config.frontendOrigins.includes(origin)) {
			response.headers.set('Access-Control-Allow-Origin', origin);
			response.headers.set('Access-Control-Allow-Credentials', 'false');
			response.headers.set('Vary', 'Origin');
		}
		return response;
	}

	if (event.url.pathname.startsWith('/console')) {
		// --- Cookie auth for the backend console (same-origin) ---------------
		const token = event.cookies.get(SESSION_COOKIE);
		const staffSession = await validateStaffSession(token);
		if (staffSession) event.locals.staff = staffSession.staff;
	}

	return resolve(event);
};

// Logs anything that reaches SvelteKit's default error handling (i.e.
// escaped the /api/** catch above, or happened on a /console/** page) with
// the same errorId shown to the user, so a bug report referencing that id
// can be found in the logs immediately.
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = randomUUID();
	logger.error('unhandled_error', {
		errorId,
		path: event.url.pathname,
		message: error instanceof Error ? error.message : String(error)
	});
	return { message: 'Something went wrong.', errorId };
};
