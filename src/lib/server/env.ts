
// Central place to read/validate env vars, instead of scattering
// `process.env.X` (or `$env/dynamic/private` imports) across the codebase.
// Using dynamic env (not static) since production is a long-running
// Codespace process, not a build-time-baked deployment.
import { env } from '$env/dynamic/private';

function required(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

export interface GroqKeyOption {
	label: string;
	key: string;
}

// Groq is the sole generation provider.
// Up to 5 configured keys can be supplied. The application does not
// automatically retry across keys; a specific key can be selected
// through the console key picker.
const GROQ_KEY_SLOTS: Array<{ envVar: string; label: string }> = [
	{ envVar: 'GROQ_API_KEY', label: 'Groq Key 1' },
	{ envVar: 'GROQ_API_KEY_2', label: 'Groq Key 2' },
	{ envVar: 'GROQ_API_KEY_3', label: 'Groq Key 3' },
	{ envVar: 'GROQ_API_KEY_4', label: 'Groq Key 4' },
	{ envVar: 'GROQ_API_KEY_5', label: 'Groq Key 5' }
];

export const config = {
	// Session configuration
	sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? '30'),

	// Local uploads directory
	uploadsDir: env.UPLOADS_DIR ?? './data/uploads',

	// Frontend CORS origins.
	// Supports comma-separated origins in FRONTEND_ORIGIN.
	frontendOrigins: (env.FRONTEND_ORIGIN ?? '')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean),

	// Groq configuration
	groqApiKey: env.GROQ_API_KEY ?? '',
	groqModel: env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',

	// Engagement thresholds — locked decision (build plan §9):
	// engaged = active in the last 7 days
	// moderate = 8–21 days
	// at-risk = 21+ days or never opened
	//
	// Kept configurable through environment variables so these values
	// can be tuned without changing application code.
	engagementEngagedDays: Number(env.ENGAGEMENT_ENGAGED_DAYS ?? '7'),
	engagementAtRiskAfterDays: Number(env.ENGAGEMENT_AT_RISK_AFTER_DAYS ?? '21'),

	/**
	 * Every configured Groq key, in slot order.
	 *
	 * Empty/unset slots are omitted rather than returned as blank keys.
	 */
	get groqApiKeyOptions(): GroqKeyOption[] {
		return GROQ_KEY_SLOTS.map((slot) => ({
			label: slot.label,
			key: env[slot.envVar] ?? ''
		})).filter((opt) => opt.key.length > 0);
	},

	/**
	 * Default/automatic path.
	 *
	 * Returns the first configured Groq key.
	 */
	get requiredGroqApiKey(): string {
		const first = this.groqApiKeyOptions[0];

		if (!first) {
			throw new Error(
				'Missing required env var: GROQ_API_KEY (or GROQ_API_KEY_2 through GROQ_API_KEY_5)'
			);
		}

		return first.key;
	},

	/**
	 * Look up a specific Groq key by its picker label.
	 *
	 * Example:
	 *   config.getGroqApiKeyByLabel('Groq Key 2')
	 */
	getGroqApiKeyByLabel(label: string): string {
		const found = this.groqApiKeyOptions.find((opt) => opt.label === label);

		if (!found) {
			throw new Error(
				`Groq key "${label}" isn't configured (its env var is unset or empty).`
			);
		}

		return found.key;
	},

	// Cloudinary configuration
	get requiredCloudinaryCloudName(): string {
		return required('CLOUDINARY_CLOUD_NAME');
	},

	get requiredCloudinaryApiKey(): string {
		return required('CLOUDINARY_API_KEY');
	},

	get requiredCloudinaryApiSecret(): string {
		return required('CLOUDINARY_API_SECRET');
	}
};

