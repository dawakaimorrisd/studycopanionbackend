import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (url.pathname === '/console/login') {
		// Already signed in? Skip the login page.
		if (locals.staff) throw redirect(303, '/console');
		return { staff: null };
	}

	if (!locals.staff) {
		throw redirect(303, `/console/login?next=${encodeURIComponent(url.pathname)}`);
	}

	return {
		staff: {
			id: locals.staff.id,
			name: locals.staff.name,
			role: locals.staff.role
		}
	};
};
