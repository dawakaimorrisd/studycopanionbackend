// Phase 11 — semester access activation, and its audit trail.
//
// Two things happen together, in one transaction, every time access is
// activated: the LIVE state (StudentSemesterAccess/InstructorSemesterAccess
// — what canAccessSemester actually reads) is upserted, and an
// append-only AccessPayment row is written. Never one without the other —
// see schema.prisma's AccessPayment comment. This is a manual,
// console-only action; there is no payment gateway integration here or
// planned (see PHASE_10_PLUS_BUILD_PLAN.md §2).
import { db } from '$lib/server/db';
import type { StaffUser } from '@prisma/client';

export async function activateStudentAccess(
	activatedBy: StaffUser,
	studentId: string,
	semesterId: string,
	amountCents: number,
	note?: string
) {
	return db.$transaction(async (tx) => {
		const access = await tx.studentSemesterAccess.upsert({
			where: { studentId_semesterId: { studentId, semesterId } },
			update: {
				isPaid: true,
				amountPaidCents: amountCents,
				paidAt: new Date(),
				activatedAt: new Date(),
				activatedById: activatedBy.id,
				revokedAt: null,
				revokedById: null
			},
			create: {
				studentId,
				semesterId,
				isPaid: true,
				amountPaidCents: amountCents,
				paidAt: new Date(),
				activatedAt: new Date(),
				activatedById: activatedBy.id
			}
		});

		await tx.accessPayment.create({
			data: {
				semesterId,
				studentId,
				amountCents,
				recordedById: activatedBy.id,
				note
			}
		});

		return access;
	});
}

export async function revokeStudentAccess(revokedBy: StaffUser, studentId: string, semesterId: string) {
	// Revoking does NOT delete the AccessPayment history — the audit trail
	// is permanent regardless of current live state. Only the live
	// StudentSemesterAccess row changes.
	return db.studentSemesterAccess.update({
		where: { studentId_semesterId: { studentId, semesterId } },
		data: { isPaid: false, revokedAt: new Date(), revokedById: revokedBy.id }
	});
}

export async function activateInstructorAccess(
	activatedBy: StaffUser,
	instructorId: string,
	semesterId: string,
	amountCents: number,
	note?: string
) {
	return db.$transaction(async (tx) => {
		const access = await tx.instructorSemesterAccess.upsert({
			where: { instructorId_semesterId: { instructorId, semesterId } },
			update: {
				isPaid: true,
				amountPaidCents: amountCents,
				paidAt: new Date(),
				activatedAt: new Date(),
				activatedById: activatedBy.id,
				revokedAt: null,
				revokedById: null
			},
			create: {
				instructorId,
				semesterId,
				isPaid: true,
				amountPaidCents: amountCents,
				paidAt: new Date(),
				activatedAt: new Date(),
				activatedById: activatedBy.id
			}
		});

		await tx.accessPayment.create({
			data: {
				semesterId,
				instructorId,
				amountCents,
				recordedById: activatedBy.id,
				note
			}
		});

		return access;
	});
}

export async function revokeInstructorAccess(revokedBy: StaffUser, instructorId: string, semesterId: string) {
	return db.instructorSemesterAccess.update({
		where: { instructorId_semesterId: { instructorId, semesterId } },
		data: { isPaid: false, revokedAt: new Date(), revokedById: revokedBy.id }
	});
}
