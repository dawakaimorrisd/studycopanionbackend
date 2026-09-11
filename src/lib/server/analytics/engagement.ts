// The single place engaged/moderate/at-risk gets decided. Both the console
// dashboard (computeCourseProgress.ts) and the Instructor API
// (/api/v1/instructors/me/students) call this, so the thresholds can never
// drift between the two surfaces. Locked decision, build plan §9:
//   - engaged   = active (a StudySession) within the last N days (default 7)
//   - at-risk   = 21+ days since last activity, OR content was sent but
//                 never opened at all — that second case is worse than
//                 "studied once and stopped," so it's flagged the same way
//   - moderate  = everything in between
// Computed per-student-per-course — never blend a student's activity across
// courses they're in, since an Instructor's dashboard should only reflect
// their own course.
import { config } from '$lib/server/env';

export type EngagementLevel = 'engaged' | 'moderate' | 'at-risk';

export interface EngagementInput {
	/** Most recent StudySession.startedAt for this student on this course's content, or null if none. */
	lastStudiedAt: Date | null;
	/** True if the student has been sent content on this course but has never opened any of it. */
	neverOpened: boolean;
}

export function classifyEngagement({ lastStudiedAt, neverOpened }: EngagementInput): EngagementLevel {
	// Sent something, opened nothing — worse than "studied once and stopped,"
	// flagged at-risk regardless of how recently it was sent.
	if (neverOpened) return 'at-risk';

	// Opened something but never logged a StudySession (e.g. only ever viewed
	// the reading, never entered a Q&A/dictionary session) — no measurable
	// study activity to classify as engaged or moderate, so at-risk.
	if (!lastStudiedAt) return 'at-risk';

	const daysSinceLastStudied = (Date.now() - lastStudiedAt.getTime()) / (1000 * 60 * 60 * 24);

	if (daysSinceLastStudied <= config.engagementEngagedDays) return 'engaged';
	if (daysSinceLastStudied <= config.engagementAtRiskAfterDays) return 'moderate';
	return 'at-risk';
}
