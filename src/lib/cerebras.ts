/**
 * Platform-wide LLM client for all AI features. No user API key needed.
 *
 * Provider is resolved at call time (see lib/llm/provider.ts) — Gemini when its
 * key is present, Cerebras otherwise, and LLM_PROVIDER overrides both. Both
 * speak the OpenAI chat-completions shape, so only the URL, key and model
 * differ. The exported names still say "cerebras" so the ~21 existing call
 * sites keep working; llmChatCompletion is the name to use in new code.
 */

import { resolveLlmProvider, keyVarFor } from './llm/provider';
// Retry policy: a single autopilot run fans out to 3-4 Cerebras calls
// (god-mode design, image-query, captions main, optional narrative).
// Two parallel "Run now" clicks can put 8+ requests on the wire within
// seconds and trip Cerebras's per-minute rate limit. Retry 429 and 5xx
// with exponential backoff + jitter so a transient hiccup doesn't
// surface as "Failed to generate caption" to the user.
//
// Backoff is intentionally tight (300ms base → max ~2.1s per call).
// god-mode has a 90s function timeout and runs up to 4 Cerebras calls;
// 3 retries × 2.1s × 4 calls = ~25s worst-case backoff, leaves margin
// for actual API time and image processing.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300;
// Per-attempt network timeout. Without this, a stalled Cerebras socket
// (connection open, no response) never settles, freezing every caller —
// the batch generator spins on "Generating 0/N" forever. A bounded abort
// turns the stall into a retryable error, then a clean throw → pool fallback.
const REQUEST_TIMEOUT_MS = 15_000;

interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function shouldRetry(status: number): boolean {
  if (status === 429) return true; // rate limit
  if (status >= 500 && status < 600) return true; // server error
  return false;
}

function backoffDelayMs(attempt: number): number {
  // Exponential backoff with jitter — attempt is 0-indexed.
  // 0 → ~500ms, 1 → ~1s, 2 → ~2s, with up to ±25% jitter.
  const base = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.round(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Reasoning models (gpt-oss, glm, qwen-3, deepseek-r1, …) spend hidden
// chain-of-thought tokens OUT OF max_tokens before emitting any visible
// content. At a tight budget the reasoning eats the whole allowance and the API
// returns EMPTY content at HTTP 200 — observed live: both gpt-oss-120b AND
// zai-glm-4.7 burned all 600 tokens on reasoning and returned 0 chars, so every
// caption/ad came back blank and autopilot reported "empty_generation".
//
// Two defenses, applied to ANY reasoning model (not just gpt-oss — the original
// guard missed glm, which is what broke production):
//   1. reasoning_effort:'low' — cuts CoT hard (gpt-oss 594→26, glm 908→606).
//   2. a max_tokens FLOOR so reasoning + output both fit even when a model only
//      partially honours reasoning_effort (glm still reasons ~600+ at 'low').
// Verified live: glm-4.7 and gpt-oss-120b both return full captions at a 4000
// floor. The floor is a CEILING, not consumption — calls still stop early, so it
// adds no latency or token cost for well-behaved output.
// Gemini 3.x Flash think before answering and bill those tokens against
// max_tokens exactly like gpt-oss does. Verified live 2026-08-24: at
// max_tokens 400 with no reasoning_effort, gemini-3.5-flash returned
// finish_reason 'length' and a truncated '{"caption":' — the same
// empty_generation failure. With reasoning_effort 'low' it returns clean JSON.
const REASONING_MODEL_RE = /gpt-oss|glm|qwen|deepseek|gemini|\br1\b/i;
const REASONING_MIN_MAX_TOKENS = Number(process.env.CEREBRAS_MIN_MAX_TOKENS) || 4000;

export function buildCerebrasRequestBody(
  messages: CerebrasMessage[],
  options: { temperature?: number; maxTokens?: number; responseFormat?: 'json' | 'text' } | undefined,
  model: string,
): Record<string, unknown> {
  const isReasoning = REASONING_MODEL_RE.test(model);
  const requestedMax = options?.maxTokens ?? 1500;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    // Floor the budget for reasoning models so CoT can't starve the output.
    max_tokens: isReasoning ? Math.max(requestedMax, REASONING_MIN_MAX_TOKENS) : requestedMax,
  };
  if (options?.responseFormat === 'json') {
    // The model is forced to emit a syntactically valid JSON object.
    body.response_format = { type: 'json_object' };
  }
  if (isReasoning) {
    body.reasoning_effort = 'low';
  }
  return body;
}

export async function llmChatCompletion(
  messages: CerebrasMessage[],
  options?: { temperature?: number; maxTokens?: number; responseFormat?: 'json' | 'text' },
): Promise<string> {
  const provider = resolveLlmProvider();
  if (!provider.apiKey) {
    throw new Error(`${keyVarFor(provider.name)} env var not set`);
  }

  const body = buildCerebrasRequestBody(messages, options, provider.model);

  const serialized = JSON.stringify(body);
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: serialized,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error — treat as transient and retry.
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      throw new Error(
        `${provider.name} network error after ${attempt + 1} attempts: ${lastErr.message}`,
      );
    }

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    const text = await response.text().catch(() => '');
    if (shouldRetry(response.status) && attempt < MAX_RETRIES) {
      // Honour Retry-After if the provider sends it, otherwise back off.
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 10_000)
          : backoffDelayMs(attempt);
      await sleep(delay);
      continue;
    }

    throw new Error(
      `${provider.name} API error (${response.status}) after ${attempt + 1} attempts: ${text}`,
    );
  }

  // Unreachable under normal control flow, but TS needs an exit.
  throw new Error(`${provider.name} retry loop exhausted: ${lastErr?.message ?? 'unknown'}`);
}

// Back-compat alias: the call sites predate the provider swap and there is no
// value in a 21-file rename just to change a word.
export const cerebrasChatCompletion = llmChatCompletion;

// "Is any LLM configured?" — used by callers to degrade gracefully rather than
// throw. Must follow the same resolution as llmChatCompletion, otherwise a
// Gemini-only deployment reports "no AI available" while working fine.
export function isLlmAvailable(): boolean {
  return Boolean(resolveLlmProvider().apiKey);
}

export const isCerebrasAvailable = isLlmAvailable;
