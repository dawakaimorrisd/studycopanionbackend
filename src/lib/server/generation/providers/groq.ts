export async function callGroq(
	prompt: string,
	apiKey: string,
	model: string
): Promise<string> {
	const res = await fetch(
		'https://api.groq.com/openai/v1/chat/completions',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				response_format: { type: 'json_object' }
			})
		}
	);

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(
			`Groq API error (${res.status}): ${body.slice(0, 500)}`
		);
	}

	const data = await res.json();
	const text = data?.choices?.[0]?.message?.content;

	if (typeof text !== 'string' || !text) {
		throw new Error('Groq returned no usable content.');
	}

	return text;
}