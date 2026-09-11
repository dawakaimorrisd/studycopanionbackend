// Minimal structured logger — one JSON line per event to stdout/stderr, so
// the Codespace's process log stays grep/jq-able instead of free-form
// strings. No external dependency; if this ever needs to ship to a real
// logging service, only this file changes, not every call site.
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context: Record<string, unknown> = {}): void {
	const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

export const logger = {
	info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
	warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
	error: (message: string, context?: Record<string, unknown>) => emit('error', message, context)
};
