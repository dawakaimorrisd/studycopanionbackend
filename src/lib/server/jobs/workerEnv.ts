function required(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}

	return value;
}

export interface GroqKeyOption {
	label: string;
	key: string;
}

const GROQ_KEY_SLOTS: Array<{ envVar: string; label: string }> = [
	{ envVar: 'GROQ_API_KEY', label: 'Groq Key 1' },
	{ envVar: 'GROQ_API_KEY_2', label: 'Groq Key 2' },
	{ envVar: 'GROQ_API_KEY_3', label: 'Groq Key 3' },
	{ envVar: 'GROQ_API_KEY_4', label: 'Groq Key 4' },
	{ envVar: 'GROQ_API_KEY_5', label: 'Groq Key 5' }
];

export const workerConfig = {
	groqModel: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',

	get groqApiKeyOptions(): GroqKeyOption[] {
		return GROQ_KEY_SLOTS.map((slot) => ({
			label: slot.label,
			key: process.env[slot.envVar] ?? ''
		})).filter((opt) => opt.key.length > 0);
	},

	get requiredGroqApiKey(): string {
		const first = this.groqApiKeyOptions[0];

		if (!first) {
			throw new Error(
				'Missing required env var: GROQ_API_KEY (or GROQ_API_KEY_2 through GROQ_API_KEY_5)'
			);
		}

		return first.key;
	},

	getGroqApiKeyByLabel(label: string): string {
		const found = this.groqApiKeyOptions.find(
			(opt) => opt.label === label
		);

		if (!found) {
			throw new Error(
				`Groq key "${label}" isn't configured (its env var is unset or empty).`
			);
		}

		return found.key;
	},

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
