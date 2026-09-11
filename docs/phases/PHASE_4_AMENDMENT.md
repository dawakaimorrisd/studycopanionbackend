# Phase 4 amendment — content density fix

**Found during real usage** (Groq as the active provider, since Gemini access was hitting problems): generated Notes/Assignments were coming back with bare question/answer pairs — no `explanation`, no `example`, no `dictionaryEntries` — even though the schema fully supports all three.

Two separate causes, both fixed:

## 1. The prompt gave the model too easy an excuse to skip them

The original prompt (`src/lib/server/generation/prompt.ts`) said things like *"only when it genuinely clarifies... otherwise omit it"* and *"it is fine for many to have none."* A fast/light model like Groq's Llama took that as license to skip these fields almost entirely — technically valid per the schema (they're legitimately optional), but useless for a study app that's built around a linked dictionary as a core feature.

**Fix:** rewrote the prompt with a fully-populated worked example (models anchor much harder on a concrete example than an abstract "field: string or null" note) and explicit minimums — `explanation` required for "almost every" question unit, `dictionaryEntries` expected on "most" question units, with the old permissive language removed. See the current `prompt.ts` for the exact wording.

**Also added:** a quality-signal log (`generation_low_content_density` in `generate.ts`) that fires — as a warning, not a failure — whenever a generation comes back with under 50% explanation coverage or under 20% dictionary coverage across its question units. This doesn't block anything; it's so a pattern like this is visible in the logs immediately next time, rather than only noticed by someone clicking into a specific Note.

## 2. The console never displayed these fields even when present

Independent of what the model returns, `/console/notes/[id]` and `/console/assignments/[id]` were never rendering `explanation`, `example`, or dictionary *definitions* (only term badges, no definitions) at all. Even a perfectly-generated question unit would have looked bare in the console.

**Fix:** both detail pages now show explanation and example inline under each question, term+definition pairs (not just term badges) per question, and a new note-wide/assignment-wide **Dictionary** section — every `dictionaryEntry` across all question units, deduplicated by term, as a proper glossary.

## Testing this fix

1. Pick a Note with real content, click Regenerate.
2. Confirm most question units now show an Explanation line and, where relevant, an Example line — not just Q/A.
3. Confirm a Dictionary section appears below the question units listing every term with its definition.
4. Check the server log for `generation_low_content_density` — it should NOT fire for a healthy generation; if it does, that's real signal something's still off with that particular generation, not a false positive to ignore.
