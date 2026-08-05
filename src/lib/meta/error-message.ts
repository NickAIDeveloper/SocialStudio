// Turns a stored Meta write error into something a marketer can act on.
//
// Meta already returns plain English alongside the machine fields:
//
//   error_user_title: "Locations Can't Be Used"
//   error_user_msg:   "Some of your locations overlap. Try removing a location."
//
// We were storing the whole JSON blob and rendering none of it, so six failed
// ads on this account showed no reason anywhere in the UI even though Meta had
// said exactly what to fix. This pulls the human half back out.
//
// Pure, no I/O.

const MAX_LENGTH = 200;

interface MetaErrorBody {
  error?: {
    message?: unknown;
    error_user_title?: unknown;
    error_user_msg?: unknown;
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function clamp(text: string): string {
  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH - 1).trimEnd() + '…' : text;
}

/**
 * `stored` is whatever went into `meta_ads.last_error`, typically a prefix
 * followed by Meta's JSON: `Meta write error 400 on /act_123/adsets: {...}`.
 * Returns null when there is no error at all.
 */
export function humanMetaError(stored: string | null | undefined): string | null {
  const raw = String(stored ?? '').trim();
  if (!raw) return null;

  const start = raw.indexOf('{');
  if (start !== -1) {
    try {
      const body = JSON.parse(raw.slice(start)) as MetaErrorBody;
      const title = str(body.error?.error_user_title);
      const message = str(body.error?.error_user_msg);

      if (title && message) {
        // Meta sometimes repeats itself; do not say it twice.
        const sameThing = message.toLowerCase().startsWith(title.toLowerCase());
        return clamp(sameThing ? message : `${title}: ${message}`);
      }
      if (message) return clamp(message);
      if (title) return clamp(title);

      // No user-facing text: the developer message is still better than JSON.
      const dev = str(body.error?.message);
      if (dev) return clamp(dev);
    } catch {
      // Not JSON after all — fall through to the raw text.
    }
  }

  return clamp(raw);
}
