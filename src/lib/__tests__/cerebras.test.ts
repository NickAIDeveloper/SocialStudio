// Tests for buildCerebrasRequestBody — the reasoning-model token-budget guard
// that fixes "empty_generation" (a reasoning model spending the whole token
// budget on hidden CoT and returning blank content).

import { describe, it, expect } from 'vitest';
import { buildCerebrasRequestBody } from '../cerebras';

const MSGS = [{ role: 'user' as const, content: 'hi' }];

describe('buildCerebrasRequestBody', () => {
  it('floors max_tokens and sets reasoning_effort=low for gpt-oss', () => {
    const body = buildCerebrasRequestBody(MSGS, { maxTokens: 600 }, 'gpt-oss-120b');
    expect(body.max_tokens).toBe(4000);
    expect(body.reasoning_effort).toBe('low');
  });

  it('floors max_tokens and sets reasoning_effort=low for glm (the model that broke prod)', () => {
    const body = buildCerebrasRequestBody(MSGS, { maxTokens: 600 }, 'zai-glm-4.7');
    expect(body.max_tokens).toBe(4000);
    expect(body.reasoning_effort).toBe('low');
  });

  it('detects qwen and deepseek reasoning families too', () => {
    expect(buildCerebrasRequestBody(MSGS, { maxTokens: 600 }, 'qwen-3-32b').reasoning_effort).toBe('low');
    expect(buildCerebrasRequestBody(MSGS, { maxTokens: 600 }, 'deepseek-r1').reasoning_effort).toBe('low');
  });

  it('does NOT touch a non-reasoning model', () => {
    const body = buildCerebrasRequestBody(MSGS, { maxTokens: 600 }, 'llama-3.3-70b');
    expect(body.max_tokens).toBe(600);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('keeps a caller budget that already exceeds the floor', () => {
    const body = buildCerebrasRequestBody(MSGS, { maxTokens: 6000 }, 'gpt-oss-120b');
    expect(body.max_tokens).toBe(6000);
  });

  it('passes response_format through for json mode', () => {
    const body = buildCerebrasRequestBody(MSGS, { responseFormat: 'json' }, 'gpt-oss-120b');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('applies sensible defaults (temperature, default max) when options omitted', () => {
    const body = buildCerebrasRequestBody(MSGS, undefined, 'llama-3.3-70b');
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(1500);
  });
});

// Gemini 3.x Flash burn max_tokens on hidden thinking exactly like gpt-oss.
// Verified live 2026-08-24: without reasoning_effort, gemini-3.5-flash returned
// finish_reason 'length' and a truncated '{"caption":'; with it, clean JSON.
describe('gemini is treated as a reasoning model', () => {
  it('floors max_tokens and sets reasoning_effort=low for gemini flash', () => {
    const body = buildCerebrasRequestBody(MSGS, { maxTokens: 400 }, 'gemini-3.5-flash');
    expect(body.max_tokens).toBe(4000);
    expect(body.reasoning_effort).toBe('low');
  });

  it('covers every gemini variant we might switch to', () => {
    for (const m of ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite']) {
      expect(buildCerebrasRequestBody(MSGS, { maxTokens: 400 }, m).reasoning_effort).toBe('low');
    }
  });
});
