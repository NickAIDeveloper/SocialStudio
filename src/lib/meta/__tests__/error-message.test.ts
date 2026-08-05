import { describe, it, expect } from 'vitest';
import { humanMetaError } from '../error-message';

// The exact string stored against the six FAILED ads on this account.
const REAL = `Meta write error 400 on /act_3339565476113613/adsets: {"error":{"message":"Invalid parameter","type":"OAuthException","code":100,"error_data":"{\\"blame_field\\":\\"targeting\\"}","error_subcode":1487756,"is_transient":false,"error_user_title":"Locations Can't Be Used","error_user_msg":"Some of your locations overlap. Try removing a location.","fbtrace_id":"AlPL0SGfrPkTU_raHcFdx_O"}}`;

describe('humanMetaError', () => {
  it('returns null when there is no error', () => {
    expect(humanMetaError(null)).toBeNull();
    expect(humanMetaError('')).toBeNull();
    expect(humanMetaError('   ')).toBeNull();
  });

  it('prefers Meta’s own plain-English title and message', () => {
    expect(humanMetaError(REAL)).toBe(
      "Locations Can't Be Used: Some of your locations overlap. Try removing a location.",
    );
  });

  it('does not repeat the title when it already ends the sentence', () => {
    const s = `x: {"error":{"error_user_title":"Budget too low","error_user_msg":"Budget too low."}}`;
    expect(humanMetaError(s)).toBe('Budget too low.');
  });

  it('uses the user message alone when there is no title', () => {
    const s = `x: {"error":{"message":"Invalid parameter","error_user_msg":"Try removing a location."}}`;
    expect(humanMetaError(s)).toBe('Try removing a location.');
  });

  it('falls back to the developer message when Meta gives no user text', () => {
    const s = `Meta write error 400: {"error":{"message":"Invalid parameter","code":100}}`;
    expect(humanMetaError(s)).toBe('Invalid parameter');
  });

  it('returns the raw text when there is no JSON to read', () => {
    expect(humanMetaError('Network timeout after 30s')).toBe('Network timeout after 30s');
  });

  it('returns the raw text when the JSON is malformed', () => {
    expect(humanMetaError('boom: {"error":{ oh no')).toBe('boom: {"error":{ oh no');
  });

  it('never returns a raw JSON blob as the message', () => {
    for (const s of [REAL, 'x: {"error":{"message":"m"}}', 'plain text']) {
      const out = humanMetaError(s);
      expect(out).not.toContain('fbtrace_id');
      expect(out).not.toContain('"error"');
    }
  });

  it('truncates a very long fallback rather than dumping it on the page', () => {
    const long = 'e'.repeat(500);
    expect(humanMetaError(long)!.length).toBeLessThanOrEqual(200);
  });
});
