// The sole generation provider (Gemini was removed — see generate.ts's
// amendment comment). OpenAI-compatible chat completions API, so
// json_object response format is available.
//
// apiKey is a parameter, not read from a single fixed env var — see
// env.ts's groqApiKeyOptions for the up-to-5-keys picker. Defaults to the
// auto/first-configured key so any caller that doesn't pass one explicitly
// still works.
import { config } from '$lib/server/env';

export async function callGroq(prompt: string, apiKey: string = config.requiredGroqApiKey): Promise<string> {
	const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: config.groqModel,
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' }
		})
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Groq API error (${res.status}): ${body.slice(0, 500)}`);
	}

	const data = await res.json();
	const text = data?.choices?.[0]?.message?.content;
	if (typeof text !== 'string' || !text) {
		throw new Error('Groq returned no usable content.');
	}
	return text;
}