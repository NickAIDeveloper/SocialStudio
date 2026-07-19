// Turn raw Meta/IG Graph error strings (e.g. `IG Graph error 500 on /me/media:
// {"error":{"code":1,"message":"An unknown error occurred"}}`) into plain
// language a user can act on, instead of dumping the API's technical message
// into the UI. Falls through to the original text for messages that are already
// human-friendly (e.g. our own validation messages).
export function friendlyIgError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes('session has expired') ||
    s.includes('validating access token') ||
    s.includes('oauthexception') ||
    s.includes('"code":190')
  ) {
    return 'Your Instagram connection has expired — please reconnect it to continue.';
  }
  if (
    s.includes('graph error') ||
    s.includes('/me/media') ||
    s.includes('unknown error') ||
    /http 5\d\d/.test(s)
  ) {
    return "Couldn't load Instagram data right now. Please try again in a moment.";
  }
  return raw;
}
