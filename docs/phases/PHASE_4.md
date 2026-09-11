# Phase 4 — AI Generation Pipeline (Synchronous)

## What this phase built

**Generation module** (`src/lib/server/generation/`):
- `schema.ts` — the `zod` schema every generation response is validated against: `{ questionUnits: [{ question, answer, explanation?, example?, isTable?, dictionaryEntries?: [{term, definition}] }] }`. This is the enforcement point for "structured JSON."
- `prompt.ts` — `buildGenerationPrompt(rawText)` (shared by both providers — same required output shape either way) and `buildRetryPrompt(original, errorMessage)`, which feeds the specific validation failure back to the model on retry rather than just asking again blind.
- `parseAndValidate.ts` — strips markdown code fences some models add despite instructions, `JSON.parse`s, then validates against the `zod` schema. Throws a plain `Error` with a message usable both in a retry prompt and in `generationError`.
- `providers/gemini.ts` — primary provider. Uses Gemini's `responseMimeType: application/json` mode as a first line of defense, on top of the prompt's own instructions.
- `providers/groq.ts` — fallback provider. OpenAI-compatible chat completions API, `response_format: json_object`.
- `generate.ts` — the orchestrator, `runGeneration(sourceType, id)`:
  1. Load `rawText` from the Note/Assignment
  2. Try Gemini; if its response fails to parse/validate, retry once with the error fed back in
  3. If Gemini fails both attempts, fall back to Groq with the same validate-and-retry-once treatment
  4. If both providers are exhausted, write a combined error message to `generationError` and stop
  5. On success, in one transaction: delete any previous `QuestionUnit`s for this record (so re-generating replaces rather than accumulates), create the new ones with their nested `DictionaryEntry` rows, stamp `generatedAt`, clear `generationError`

**Console wiring** — both `/console/notes/[id]` and `/console/assignments/[id]` gained a `?/generate` form action and a "Generate" / "Regenerate" button. This is genuinely synchronous: the button click is a normal form POST that blocks until `runGeneration` returns, with a "Generating…" disabled state in the meantime — no job table, no polling, no worker process, per the build plan's simplification.

## Why no job queue

Generation volume for a single-college pilot doesn't need one, and running an inline `await` in the form action is dramatically simpler to build, deploy, and reason about than a background worker. The trade-off is real — a slow generation call means the person clicking "Generate" waits for it — but that's an acceptable cost at this scale, and revisiting it later (adding a job table back) wouldn't require changing anything about the prompt/validation/provider logic, only how `runGeneration` gets invoked.

## Why generation never throws

`runGeneration` catches everything internally and writes failures to `generationError` instead of throwing. This means the console UI has exactly one thing to check (`generationError` vs `generatedAt`) rather than needing try/catch around every call site, and a failed generation is always visibly recorded on the record itself, not lost in a server log.

## Testing this phase

Real testing needs `GEMINI_API_KEY` and `GROQ_API_KEY` set in `.env` — until then, clicking "Generate" will fail against a live API call (expected: `Missing required env var: GEMINI_API_KEY`, thrown by `config.requiredGeminiApiKey`, written to `generationError`) but proves the whole button → action → orchestrator → DB-write path works.

Once real keys are in place:
1. Open a Note with real pasted content, click Generate
2. Confirm the page updates with a "Generated" badge and the question units/dictionary terms appear
3. Click Regenerate — confirm the old question units are replaced, not duplicated
4. Temporarily set `GEMINI_API_KEY` to something invalid to confirm the Groq fallback actually fires and, if that also fails, that `generationError` renders clearly on the page

## Exit criteria

- [ ] Clicking Generate on a real Note (including one whose `rawText` came from an uploaded file) produces reviewable question units and dictionary entries within the same request/response cycle
- [ ] A failed generation is visible on the record (`generationError`) and Generate can be clicked again afterward
