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
