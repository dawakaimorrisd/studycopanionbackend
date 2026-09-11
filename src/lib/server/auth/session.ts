// One session *mechanism* for everyone — Admin/Moderator/Instructor all use
// the StaffUser `Session` table, Student uses `StudentSession`. The console
// (Admin/Moderator) reads the token from a cookie; the API (Instructor,
// Student) reads it from an `Authorization: Bearer <token>` header. Token
// generation/validation logic below is identical either way — only the
// transport differs, handled in hooks.server.ts and the login routes.
import { randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';
import { config } from '$lib/server/env';
import type { StaffUser, Student } from '@prisma/client';

function generateToken(): string {
	// 32 bytes -> 43-char base64url token. Opaque, unguessable, not a JWT —
	// there's nothing that needs to be encoded in it, and an opaque token is
	// trivially revocable (just delete the row), which a JWT is not.
	return randomBytes(32).toString('base64url');
}

function expiryDate(): Date {
	return new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
}

// ── Staff (Admin / Moderator / Instructor) ──────────────────────────────

export async function createStaffSession(staffId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const expiresAt = expiryDate();
	await db.session.create({ data: { id: token, staffId, expiresAt } });
	return { token, expiresAt };
}

export async function validateStaffSession(
	token: string | undefined | null
): Promise<{ staff: StaffUser } | null> {
	if (!token) return null;

	const session = await db.session.findUnique({ where: { id: token }, include: { staff: true } });
	if (!session) return null;

	if (session.expiresAt < new Date() || session.staff.deletedAt) {
		await db.session.delete({ where: { id: token } }).catch(() => {});
		return null;
	}

	return { staff: session.staff };
}

export async function invalidateStaffSession(token: string): Promise<void> {
	await db.session.delete({ where: { id: token } }).catch(() => {});
}

// ── Student ──────────────────────────────────────────────────────────────

export async function createStudentSession(
	studentId: string
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const expiresAt = expiryDate();
	await db.studentSession.create({ data: { id: token, studentId, expiresAt } });
	return { token, expiresAt };
}

export async function validateStudentSession(
	token: string | undefined | null
): Promise<{ student: Student } | null> {
	if (!token) return null;

	const session = await db.studentSession.findUnique({
		where: { id: token },
		include: { student: true }
	});
	if (!session) return null;

	if (session.expiresAt < new Date() || session.student.deletedAt) {
		await db.studentSession.delete({ where: { id: token } }).catch(() => {});
		return null;
	}

	return { student: session.student };
}

export async function invalidateStudentSession(token: string): Promise<void> {
	await db.studentSession.delete({ where: { id: token } }).catch(() => {});
}
