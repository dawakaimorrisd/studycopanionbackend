// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { StaffUser, Student } from '@prisma/client';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// Populated by hooks.server.ts. `staff` is set for console routes
			// (from a cookie) and for Instructor API routes (from a bearer
			// token) — same Session table, different transport. `student` is
			// set only for Student API routes (bearer token, StudentSession).
			staff: StaffUser | null;
			student: Student | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
