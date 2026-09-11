// Simple in-memory fixed-window rate limiter, applied to every auth
// endpoint (console login, student signup/login, instructor login) per
// build plan §7 ("Rate limiting on auth endpoints"). An in-memory Map is
// enough for a single-process Codespace deployment — no Redis or other
// shared store needed at this scale. If this ever runs across multiple
// processes/instances, swap the Map for a shared store; call sites don't
// need to change, since they only see allow/deny + retry time.
import { logger } from './logger';

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Prune expired buckets periodically so this doesn't grow unbounded over a
// long-running process. unref() so this timer never keeps the process alive
// on its own (relevant for tests/scripts, not the running app).
const pruneInterval = setInterval(
	() => {
		const now = Date.now();
		for (const [key, bucket] of buckets) {
			if (bucket.resetAt <= now) buckets.delete(key);
		}
	},
	5 * 60 * 1000
);
pruneInterval.unref?.();

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

/**
 * @param key Unique per limiter + identity, e.g. `console-login:${ip}`.
 * @param maxAttempts Attempts allowed within `windowMs`.
 * @param windowMs Window length in milliseconds.
 */
export function rateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const existing = buckets.get(key);

	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, retryAfterSeconds: 0 };
	}

	if (existing.count >= maxAttempts) {
		const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
		logger.warn('rate_limited', { key, retryAfterSeconds });
		return { allowed: false, retryAfterSeconds };
	}

	existing.count += 1;
	return { allowed: true, retryAfterSeconds: 0 };
}
