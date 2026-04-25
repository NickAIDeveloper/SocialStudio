/**
 * Cerebras AI utility — platform-wide LLM for all AI features.
 * Uses the CEREBUS env var key. No user API key needed.
 */

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama3.1-8b';

interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function cerebrasChatCompletion(
  messages: CerebrasMessage[],
  options?: { temperature?: number; maxTokens?: number; responseFormat?: 'json' | 'text' },
): Promise<string> {
  const apiKey = process.env.CEREBUS;
  if (!apiKey) throw new Error('CEREBUS env var not set');

  const body: Record<string, unknown> = {
    model: CEREBRAS_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 1500,
  };
  if (options?.responseFormat === 'json') {
    // Cerebras supports OpenAI-compatible JSON mode on llama-3.1-8b.
    // The model is forced to emit a syntactically valid JSON object.
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(CEREBRAS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Cerebras API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export function isCerebrasAvailable(): boolean {
  return !!process.env.CEREBUS;
}
