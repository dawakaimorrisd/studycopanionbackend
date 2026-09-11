// The structured shape Groq is prompted to return, and
// what actually gets validated before anything is written to the DB. See
// build plan: "structured JSON, validate-and-retry-once, no difficulty
// tiers, single rigor-focused generation."
//
// v9 (Phase 9): pivoted to multiple choice. correctOption is checked against
// the four option keys at validation time (not just "any string") so a
// model returning an out-of-range letter fails validation and triggers the
// existing retry-once path, rather than silently writing bad data.
import { z } from 'zod';

export const dictionaryEntrySchema = z.object({
	term: z.string().trim().min(1),
	definition: z.string().trim().min(1),
	example: z.string().trim().min(1).nullable().optional()
});

const optionLetterSchema = z.enum(['A', 'B', 'C', 'D']);

export const questionUnitSchema = z
	.object({
		question: z.string().trim().min(1),
		optionA: z.string().trim().min(1),
		optionB: z.string().trim().min(1),
		optionC: z.string().trim().min(1),
		optionD: z.string().trim().min(1),
		correctOption: optionLetterSchema,
		explanation: z.string().trim().min(1).nullable().optional(),
		isTable: z.boolean().optional().default(false),
		// Dictionary terms are linked to the specific question unit they came
		// from, never a flat glossary — see schema.prisma's DictionaryEntry.
		dictionaryEntries: z.array(dictionaryEntrySchema).optional().default([])
	})
	.refine(
		(qu) => {
			const options = [qu.optionA, qu.optionB, qu.optionC, qu.optionD];
			const unique = new Set(options.map((o) => o.trim().toLowerCase()));
			return unique.size === options.length;
		},
		{ message: 'The four options must be distinct from one another.' }
	);

export const generationResponseSchema = z.object({
	questionUnits: z.array(questionUnitSchema).min(1, 'Must generate at least one question unit.')
});

export type GenerationResponse = z.infer<typeof generationResponseSchema>;
export type GeneratedQuestionUnit = z.infer<typeof questionUnitSchema>;