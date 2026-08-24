// The provider swap exists because being welded to one vendor turned a billing
// event into a week-long silent outage. These tests pin the resolution rules so
// a future edit can't quietly re-weld it.
import { describe, it, expect } from 'vitest';
import { resolveLlmProvider, keyVarFor } from '../provider';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

describe('resolveLlmProvider', () => {
  it('prefers Gemini when its key is present — that is the funded provider', () => {
    const p = resolveLlmProvider(env({ GEMINI_FLASH_API_KEY: 'g', CEREBUS: 'c' }));
    expect(p.name).toBe('gemini');
    expect(p.apiKey).toBe('g');
    expect(p.url).toContain('generativelanguage.googleapis.com');
    expect(p.model).toBe('gemini-3.5-flash');
  });

  it('falls back to Cerebras when there is no Gemini key', () => {
    const p = resolveLlmProvider(env({ CEREBUS: 'c' }));
    expect(p.name).toBe('cerebras');
    expect(p.apiKey).toBe('c');
    expect(p.url).toContain('api.cerebras.ai');
  });

  // The revert switch. If Gemini misbehaves, one env var goes back.
  it('lets LLM_PROVIDER override key-presence in both directions', () => {
    expect(resolveLlmProvider(env({ LLM_PROVIDER: 'cerebras', GEMINI_FLASH_API_KEY: 'g', CEREBUS: 'c' })).name)
      .toBe('cerebras');
    expect(resolveLlmProvider(env({ LLM_PROVIDER: 'gemini', CEREBUS: 'c' })).name).toBe('gemini');
  });

  it('reports the key as missing rather than inventing one', () => {
    const p = resolveLlmProvider(env({ LLM_PROVIDER: 'gemini' }));
    expect(p.apiKey).toBeUndefined();
  });

  it('allows the model to be changed without a redeploy', () => {
    expect(resolveLlmProvider(env({ GEMINI_FLASH_API_KEY: 'g', GEMINI_MODEL: 'gemini-3.7-flash' })).model)
      .toBe('gemini-3.7-flash');
    expect(resolveLlmProvider(env({ CEREBUS: 'c', CEREBRAS_MODEL: 'zai-glm-4.7' })).model).toBe('zai-glm-4.7');
  });

  it('names the right env var for a missing key', () => {
    expect(keyVarFor('gemini')).toBe('GEMINI_FLASH_API_KEY');
    expect(keyVarFor('cerebras')).toBe('CEREBUS');
  });
});
