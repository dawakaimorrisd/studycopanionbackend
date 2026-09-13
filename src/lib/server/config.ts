export interface GroqKeyOption {
	label: string;
	key: string;
}

export interface GenerationConfig {
	readonly groqModel: string;
	readonly groqApiKeyOptions: GroqKeyOption[];
	readonly requiredGroqApiKey: string;

	getGroqApiKeyByLabel(label: string): string;
}