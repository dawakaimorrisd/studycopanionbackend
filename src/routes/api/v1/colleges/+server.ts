// GET /api/v1/colleges — the one deliberately public, unauthenticated route
// in this API. A student picks their college during signup (POST
// /students/signup requires a valid collegeId) and has no account yet at
// that point, so this has to be readable without a token. Read-only, and
// only ever returns id/name — never anything else about a college (no
// student counts, no course lists) since this route has no access control
// at all.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const colleges = await db.college.findMany({
		orderBy: { name: 'asc' },
		select: { id: true, name: true }
	});

	return json({ colleges });
};
