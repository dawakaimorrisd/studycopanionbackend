
// POST /api/v1/students/me/submissions/:id/generate
//
// Generates QuestionUnit/DictionaryEntry material from an Assignment's own
// rawText using the synchronous Groq generation pipeline.
//
// `:id` is the Assignment id. There is no separate submission entity.
//
// Generation rules:
// - INDIVIDUAL assignment owner: can generate.
// - GROUP assignment submitter: can generate.
// - GROUP member: cannot generate.
// - Only the group submitter can later distribute/share the generated material.
//
// The client sends only a safe Groq key label such as "key1", "key2", etc.
// The actual Groq API secret never reaches the browser. The server resolves
// the label through config.getGroqApiKeyByLabel().
//
// The selected key is used for the normal validate-and-retry-once pipeline.
// There is deliberately no automatic fallback to another Groq key.

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { runGeneration } from '$lib/server/generation/generate';
import { API_ERRORS } from '$lib/server/apiResponse';
import { config } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.student) {
		return API_ERRORS.notAuthenticated();
	}

	const assignment = await db.assignment.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			submittedById: true,
			type: true,
			rawText: true
		}
	});

	if (!assignment) {
		return API_ERRORS.notFound('Assignment');
	}

	// Only the student who submitted the assignment can generate material.
	//
	// This means:
	// - Individual owner -> allowed
	// - Group submitter/head -> allowed
	// - Group member -> denied
	if (assignment.submittedById !== locals.student.id) {
		return API_ERRORS.noAccess('assignment');
	}

	if (!assignment.rawText) {
		return API_ERRORS.badRequest(
			"Couldn't extract text from this assignment's file — re-submit with a parseable PDF or DOCX to generate from it."
		);
	}

	// The frontend sends a non-secret key label, never the actual API key.
	//
	// Example:
	//   { "groqKey": "key2" }
	//
	// If omitted, runGeneration() uses the configured default/first key.
	let groqKey: string | undefined;

	try {
		const body = await request.json();

		if (body && typeof body.groqKey === 'string' && body.groqKey.trim()) {
			groqKey = body.groqKey.trim();
		}
	} catch {
		// No JSON body is also valid. In that case the generation pipeline
		// uses the default configured Groq key.
	}

	// Validate the requested label before starting generation.
	//
	// getGroqApiKeyByLabel() is the server-side mapping from a safe label
	// to the actual secret. We intentionally never expose that secret.
	if (groqKey) {
		try {
			config.getGroqApiKeyByLabel(groqKey);
		} catch {
			return API_ERRORS.badRequest('Invalid Groq generation key selected.');
		}
	}

	await runGeneration('ASSIGNMENT', assignment.id, {
		forceGroqKeyLabel: groqKey
	});

	const updated = await db.assignment.findUnique({
		where: { id: assignment.id },
		select: {
			generatedAt: true,
			generationError: true,
			questionUnits: {
				orderBy: { order: 'asc' },
				include: { dictionaryEntries: true }
			}
		}
	});

	if (updated?.generationError) {
		return API_ERRORS.badRequest(updated.generationError);
	}

	return json({
		generated: true,
		generatedAt: updated?.generatedAt ?? null,
		questionUnits: (updated?.questionUnits ?? []).map((qu) => ({
			id: qu.id,
			order: qu.order,
			question: qu.question,
			optionA: qu.optionA,
			optionB: qu.optionB,
			optionC: qu.optionC,
			optionD: qu.optionD,
			correctOption: qu.correctOption,
			explanation: qu.explanation,
			isTable: qu.isTable,
			dictionaryEntries: qu.dictionaryEntries.map((d) => ({
				term: d.term,
				definition: d.definition,
				example: d.example
			}))
		}))
	});
};

