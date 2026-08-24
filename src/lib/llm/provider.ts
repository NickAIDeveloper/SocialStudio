// Which LLM actually serves the platform's AI features.
//
// Why this exists: Cerebras' free allowance was a one-off $5 trial, not a
// recurring tier. When it ran dry on 2026-08-16 every generation call started
// returning 402 and the autopilot silently produced nothing for a week — while
// the daily cron still reported success. Being tied to one provider with no way
// to switch turned a billing event into an outage.
//
// Both providers speak the OpenAI chat-completions shape, so swapping is a base
// URL, a key and a model name. Nothing at the ~21 call sites changes.

export type LlmProviderName = 'cerebras' | 'gemini';

export interface LlmProvider {
  name: LlmProviderName;
  url: string;
  apiKey: string | undefined;
  model: string;
}

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
// Google's OpenAI-compatibility layer. The native /v1beta endpoint uses a
// different request shape; this one accepts the exact body we already build.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b';
// Flash is free of charge on Google's free tier (input AND output), which is
// the whole point of choosing it over Pro.
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

// Resolution order:
//   1. LLM_PROVIDER, if set, always wins — this is the revert switch.
//   2. Otherwise prefer Gemini when its key is present, because that is the
//      provider that is actually funded.
//   3. Fall back to Cerebras.
export function resolveLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  const geminiKey = env.GEMINI_FLASH_API_KEY ?? env.GEMINI_API_KEY;

  const useGemini = explicit ? explicit === 'gemini' : Boolean(geminiKey);

  if (useGemini) {
    return {
      name: 'gemini',
      url: GEMINI_URL,
      apiKey: geminiKey,
      model: env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    };
  }
  return {
    name: 'cerebras',
    url: CEREBRAS_URL,
    apiKey: env.CEREBUS ?? env.CEREBRAS_API_KEY,
    model: env.CEREBRAS_MODEL ?? DEFAULT_CEREBRAS_MODEL,
  };
}

// Human-readable name of the env var a given provider needs, so a missing-key
// error tells the operator exactly what to set rather than naming the wrong one.
export function keyVarFor(name: LlmProviderName): string {
  return name === 'gemini' ? 'GEMINI_FLASH_API_KEY' : 'CEREBUS';
}
