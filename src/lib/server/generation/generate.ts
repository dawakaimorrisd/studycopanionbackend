// The whole generation pipeline, run synchronously inline in a console form
// action (see build plan §6/Phase 4 — no job table, no worker).
//
// v9 amendment: Gemini has been removed entirely. Groq is now the sole
// generation provider. Staff can either use the default/first configured
// Groq key or explicitly select one of the configured keys in the console.
//
// The selected Groq key gets the same validate-and-retry-once treatment.
// There is deliberately NO automatic fallback from one Groq key to another.
//
// If both attempts with the selected key fail, generationError is written
// to the source record and the pipeline stops. "Generate" can be clicked
// again later.

import { db } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { buildGenerationPrompt, buildRetryPrompt } from './prompt';
import { callGroq } from './providers/groq';
import { parseGenerationResponse } from './parseAndValidate';
import { logger } from '$lib/server/logger';

import type { GenerationConfig } from '$lib/server/config';
import type { GenerationResponse } from './schema';

export type GenerationSourceType = 'NOTE' | 'ASSIGNMENT';

type ProviderCall = (prompt: string) => Promise<string>;

/**
 * Call the selected provider and validate its response.
 *
 * If the first response is invalid or unparseable, retry once with the
 * validation/parsing error included in the retry prompt.
 *
 * There is intentionally no automatic retry against another Groq key.
 */
async function callWithRetry(
	call: ProviderCall,
	prompt: string,
	providerLabel: string
): Promise<GenerationResponse> {
	try {
		const raw = await call(prompt);
		return parseGenerationResponse(raw);
	} catch (firstError) {
		const firstMessage =
			firstError instanceof Error ? firstError.message : String(firstError);

		try {
			const raw = await call(buildRetryPrompt(prompt, firstMessage));
			return parseGenerationResponse(raw);
		} catch (secondError) {
			const secondMessage =
				secondError instanceof Error ? secondError.message : String(secondError);

			throw new Error(
				`${providerLabel} failed twice — first: ${firstMessage}; retry: ${secondMessage}`
			);
		}
	}
}

/**
 * Store a generation failure against the original Note or Assignment.
 */
async function writeGenerationError(
	sourceType: GenerationSourceType,
	id: string,
	message: string
): Promise<void> {
	if (sourceType === 'NOTE') {
		await db.note.update({
			where: { id },
			data: { generationError: message }
		});
	} else {
		await db.assignment.update({
			where: { id },
			data: { generationError: message }
		});
	}
}

/**
 * Persist a successful generation.
 *
 * Existing question units are removed first so clicking Generate again
 * replaces the previous generation instead of accumulating duplicates.
 */
async function writeGenerationResult(
	sourceType: GenerationSourceType,
	id: string,
	result: GenerationResponse
): Promise<void> {
	const total = result.questionUnits.length;

	const withExplanation = result.questionUnits.filter(
		(qu) => qu.explanation
	).length;

	const withDictionary = result.questionUnits.filter(
		(qu) => qu.dictionaryEntries.length > 0
	).length;

	if (
		total > 0 &&
		(withExplanation / total < 0.5 || withDictionary / total < 0.2)
	) {
		logger.warn('generation_low_content_density', {
			sourceType,
			id,
			total,
			explanationRate: withExplanation / total,
			dictionaryRate: withDictionary / total
		});
	}

	await db.$transaction(async (tx: Prisma.TransactionClient) => {
		if (sourceType === 'NOTE') {
			await tx.questionUnit.deleteMany({
				where: { noteId: id }
			});
		} else {
			await tx.questionUnit.deleteMany({
				where: { assignmentId: id }
			});
		}

		for (let i = 0; i < result.questionUnits.length; i++) {
			const qu = result.questionUnits[i];

			await tx.questionUnit.create({
				data: {
					sourceType,
					order: i,

					question: qu.question,
					optionA: qu.optionA,
					optionB: qu.optionB,
					optionC: qu.optionC,
					optionD: qu.optionD,
					correctOption: qu.correctOption,

					explanation: qu.explanation ?? null,
					isTable: qu.isTable ?? false,

					noteId: sourceType === 'NOTE' ? id : null,
					assignmentId: sourceType === 'ASSIGNMENT' ? id : null,

					dictionaryEntries: {
						create: qu.dictionaryEntries.map((d) => ({
							term: d.term,
							definition: d.definition,
							example: d.example ?? null
						}))
					}
				}
			});
		}

		if (sourceType === 'NOTE') {
			await tx.note.update({
				where: { id },
				data: {
					generatedAt: new Date(),
					generationError: null
				}
			});
		} else {
			await tx.assignment.update({
				where: { id },
				data: {
					generatedAt: new Date(),
					generationError: null
				}
			});
		}
	});
}

/**
 * Runs the complete generation pipeline for one Note or Assignment.
 *
 * `forceGroqKeyLabel`:
 *   - omitted → use the first configured Groq key
 *   - supplied → use the specifically selected Groq key
 *
 * `configOverride`:
 *   - omitted → use the normal SvelteKit application config
 *   - supplied → use an alternative runtime config, such as the
 *     standalone worker's process.env-based config
 *
 * The function never throws generation errors to the caller.
 * Failures are written to `generationError`.
 */
export async function runGeneration(
	sourceType: GenerationSourceType,
	id: string,
	options: {
		forceGroqKeyLabel?: string;
		configOverride?: GenerationConfig;
	} = {}
): Promise<void> {
	const runtimeConfig =
	options.configOverride ??
	(await import('$lib/server/env')).config;

	const keyLabel = options.forceGroqKeyLabel;

	logger.info('generation_started', {
		sourceType,
		id,
		groqKey: keyLabel ?? 'default'
	});

	// Retrieve the source content.
	let rawText: string | null | undefined;

	if (sourceType === 'NOTE') {
		rawText = (
			await db.note.findUnique({
				where: { id },
				select: { rawText: true }
			})
		)?.rawText;
	} else {
		rawText = (
			await db.assignment.findUnique({
				where: { id },
				select: { rawText: true }
			})
		)?.rawText;
	}

	// Nothing to generate from.
	if (!rawText) {
		const message = 'Record not found, or has no content to generate from.';

		logger.error('generation_failed', {
			sourceType,
			id,
			reason: message
		});

		await writeGenerationError(sourceType, id, message);
		return;
	}

	const prompt = buildGenerationPrompt(rawText);

	let result: GenerationResponse;

	try {
		// If staff explicitly selected a key, use that key.
		// Otherwise use the first configured Groq key.
		const apiKey = keyLabel
			? runtimeConfig.getGroqApiKeyByLabel(keyLabel)
			: runtimeConfig.requiredGroqApiKey;

		const providerLabel = keyLabel
			? `Groq (${keyLabel})`
			: 'Groq';

		result = await callWithRetry(
			(promptToSend) => callGroq(
	promptToSend,
	apiKey,
	runtimeConfig.groqModel
),
			prompt,
			providerLabel
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);

		logger.error('generation_failed', {
			sourceType,
			id,
			provider: 'groq',
			groqKey: keyLabel ?? 'default',
			reason: message
		});

		await writeGenerationError(sourceType, id, message);
		return;
	}

	// Persist the successful generation.
	await writeGenerationResult(sourceType, id, result);

	logger.info('generation_succeeded', {
		sourceType,
		id,
		groqKey: keyLabel ?? 'default',
		questionUnitCount: result.questionUnits.length
	});
}