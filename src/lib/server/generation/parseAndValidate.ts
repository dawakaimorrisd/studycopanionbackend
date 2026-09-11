import { generationResponseSchema, type GenerationResponse } from './schema';

/**
 * Models sometimes wrap JSON in markdown code fences despite instructions
 * not to — strip that before parsing, then validate strictly. Throws a
 * plain Error with a message suitable for feeding back into a retry prompt
 * (see buildRetryPrompt) or for writing to Note/Assignment.generationError.
 */
export function parseGenerationResponse(raw: string): GenerationResponse {
	const cleaned = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```\s*$/, '')
		.trim();

	let json: unknown;
	try {
		json = JSON.parse(cleaned);
	} catch {
		throw new Error('Response was not valid JSON.');
	}

	const result = generationResponseSchema.safeParse(json);
	if (!result.success) {
		const issue = result.error.issues[0];
		const path = issue?.path.join('.') || '(root)';
		throw new Error(`Response did not match the expected shape at "${path}": ${issue?.message}`);
	}

	return result.data;
}
