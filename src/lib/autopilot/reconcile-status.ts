// src/lib/autopilot/reconcile-status.ts
//
// Pure status reconciliation: given what we think a post's status is locally and
// what Buffer says is true right now, decide the new local status (or no change).
//
// Why this exists: the run route writes status='scheduled' the moment Buffer
// accepts a post, and nothing ever advanced it again. So a post Buffer already
// SENT kept showing "Scheduled" forever (user checks Buffer's queue, sees
// nothing, thinks it never scheduled), and a post Buffer DROPPED (failed to
// publish, NOT_FOUND on lookup) still showed a confident "Buffer ✓". This maps
// Buffer's ground truth back onto our row.

// What a Buffer post-by-id lookup told us. `found: false` means Buffer returned
// NOT_FOUND for an id we had stored — the post is genuinely gone.
// Buffer's own publish-failure explanation, when it has one.
export interface BufferPublishError {
  message: string | null;
  rawError: string | null;
}

export type BufferLookup =
  | { found: true; status: string; dueAt: string | null; error?: BufferPublishError | null }
  | { found: false };

export interface LocalStatusPatch {
  status: 'published' | 'failed';
  publishedAt: Date | null;
  // Why it failed, in Buffer's words, or null when there's nothing to say. Stored
  // so a failed post explains itself ("Buffer has lost authorization to post on
  // your behalf") instead of showing a bare "Failed" with the cause invisible.
  failureReason: string | null;
}

// Buffer gives a friendly `message` and a terse `rawError` ("Invalid
// Credentials"). Keep both when present — the message tells the user what to do,
// the raw error is what you grep for when diagnosing.
function formatFailureReason(error: BufferPublishError | null | undefined): string | null {
  if (!error) return null;
  const { message, rawError } = error;
  if (message && rawError) return `${message} (${rawError})`;
  return message ?? rawError ?? null;
}

// Returns the patch to apply, or null when the row should be left untouched.
//
// Conservative on purpose:
//   - Only reconciles rows we currently believe are 'scheduled'. draft /
//     published / failed are terminal locally and must never be churned by a
//     transient Buffer state.
//   - Posts still upcoming in Buffer (scheduled/sending/...) return null — no
//     write, no churn.
export function reconcileStatus(
  localStatus: string,
  buffer: BufferLookup,
): LocalStatusPatch | null {
  if (localStatus !== 'scheduled') return null;

  if (!buffer.found) {
    // Had a bufferPostId, Buffer no longer has it: publish failed and Buffer
    // dropped the post. Show "Failed" instead of a false "Scheduled ✓".
    return {
      status: 'failed',
      publishedAt: null,
      failureReason: 'Buffer no longer has this post — it was dropped after a failed publish.',
    };
  }

  const s = buffer.status.toLowerCase();
  if (s === 'sent') {
    // Buffer published it. Record when (its due time) so the UI can show it.
    // Any error Buffer still carries is stale (errored once, retried, went out).
    return {
      status: 'published',
      publishedAt: buffer.dueAt ? new Date(buffer.dueAt) : null,
      failureReason: null,
    };
  }
  if (s === 'failed' || s === 'service_failed' || s === 'error') {
    return { status: 'failed', publishedAt: null, failureReason: formatFailureReason(buffer.error) };
  }
  // 'scheduled' | 'sending' | 'buffer' | 'draft' | 'pending' → still upcoming.
  return null;
}
