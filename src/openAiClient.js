function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }

  return chunks.join('\n').trim();
}

export class OpenAiClient {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async createTextResponse({ instructions, input, maxOutputTokens = 220 }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI responses.');
    }

    const response = await this.fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }

    const text = extractOutputText(data);
    if (!text) throw new Error('OpenAI response did not include output text.');

    return text;
  }
}
