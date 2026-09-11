// One prompt, shared by both providers, since the required output shape is
// identical either way. Deliberately no difficulty tiers — a single,
// consistent, exam-relevant level of rigor, per the plan.
//
// v9 (Phase 9): pivoted to multiple choice, per the dean's requirement that
// instructors get an objective, gradable per-chapter score signal rather
// than a study-time proxy. correctOption is now the field that used to be
// answer; explanation is still generated at this same step for every
// question unit — it's written to the DB either way, just delivered to
// students conditionally downstream (see Note.testRevealedAt), not withheld
// here. `example` moved off the question unit entirely and onto each
// dictionary entry instead, since the dean specified the dictionary itself
// should now both define and illustrate a term.
//
// NOTE: this prompt was tightened after real usage showed the original
// wording ("only when it genuinely clarifies... otherwise omit it") gave
// faster/lighter Groq models (e.g. an 8B-class model vs a 70B one) too easy
// an excuse to skip explanation/dictionaryEntries almost entirely —
// producing bare question/answer pairs. The fix is a positive worked example
// with every field populated (models anchor much harder on a concrete
// example than an abstract "or null" schema note) plus explicit minimums.
// Kept that lesson intact through the MCQ pivot.
const RESPONSE_SHAPE_EXAMPLE = `{
  "questionUnits": [
    {
      "question": "What is the powerhouse of the cell?",
      "optionA": "The nucleus",
      "optionB": "The mitochondrion",
      "optionC": "The ribosome",
      "optionD": "The Golgi apparatus",
      "correctOption": "B",
      "explanation": "Mitochondria generate ATP through oxidative phosphorylation, which supplies the energy most other cellular processes depend on — that's why they're described this way.",
      "isTable": false,
      "dictionaryEntries": [
        {
          "term": "Oxidative phosphorylation",
          "definition": "The metabolic process that uses oxygen to convert nutrients into usable cellular energy (ATP).",
          "example": "A muscle cell, which needs a constant, high energy supply for contraction, relies heavily on this process."
        }
      ]
    }
  ]
}`;

export function buildGenerationPrompt(rawText: string): string {
	return `You are generating study material for a college study app. The content below comes from a course Note or Assignment. Produce a set of rigorous, exam-relevant multiple-choice question units covering it thoroughly.

Rules:
- Single consistent level of rigor appropriate for a college course — do NOT create easy/medium/hard tiers or label difficulty.
- Each question unit is multiple choice: a clear question stem, exactly four options ("optionA" through "optionD"), and "correctOption" naming which one ("A" | "B" | "C" | "D").
- The three incorrect options must be plausible, not obviously wrong filler — a student who skimmed the material should be able to be misled by at least one of them. Avoid "all of the above" / "none of the above" options.
- All four options must be genuinely distinct from one another.
- "explanation" is REQUIRED for almost every question unit — one to three sentences on WHY the correct option is correct (and, where useful, why a tempting wrong option is wrong), not just a restatement of it. Only leave it null for the rare question that's pure recall with genuinely nothing to add — that should be the exception, not the norm. If you're unsure whether to include one, include it.
- Set "isTable" to true only if the question stem itself is genuinely best presented as a table (e.g. asking the student to interpret a comparison); in that case format the table as markdown inside "question".
- "dictionaryEntries": actively look for technical terms, named concepts, or jargon in the question or options and define them — err on the side of including a term if a student might not already know it. Across the full set of question units, MOST should have at least one dictionary entry. Each dictionary entry should also include "example" whenever a concrete example, application, or scenario would help a student understand or remember the term — this should be common, not rare; leave it null only when no example genuinely fits.
- Cover the content thoroughly rather than producing a token handful of questions — if the content is substantial, produce enough question units to actually cover it.

Study the worked example below — note that explanation and dictionaryEntries (including each entry's example) are all populated, not left null. Match that density, not a bare question with four options.

Return ONLY valid JSON matching exactly this shape — no markdown code fences, no commentary before or after:
${RESPONSE_SHAPE_EXAMPLE}

Content to generate from:
"""
${rawText}
"""`;
}

export function buildRetryPrompt(originalPrompt: string, previousErrorMessage: string): string {
	return `${originalPrompt}

Your previous response could not be used: ${previousErrorMessage}
Return ONLY the corrected JSON matching the required shape exactly — no markdown code fences, no commentary.`;
}