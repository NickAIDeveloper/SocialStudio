// Minimal operational-alert email sender.
//
// Reuses the same Resend HTTP API + verified sender domain already used by the
// password-reset flow (src/app/api/auth/forgot-password/route.ts) so it needs no
// new infrastructure — only RESEND_API_KEY (already configured in prod).
//
// Deliberately best-effort and non-throwing: an alert that fails to send must
// never crash the caller (a cron watchdog). It reports what happened instead.

const DEFAULT_ALERT_EMAIL = 'origae@socialstudio.app';
const ALERT_FROM = 'GoViraleza Alerts <noreply@goviraleza.com>';

export interface SendAlertResult {
  sent: boolean;
  // Why nothing was sent, when sent === false. Surfaced by callers for logging.
  skippedReason?: 'no_api_key' | 'send_failed';
  to?: string;
}

export interface SendAlertInput {
  subject: string;
  html: string;
  // Recipient override; defaults to CRON_ALERT_EMAIL env, then a constant.
  to?: string;
}

export async function sendAlertEmail(input: SendAlertInput): Promise<SendAlertResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = input.to ?? process.env.CRON_ALERT_EMAIL ?? DEFAULT_ALERT_EMAIL;

  if (!apiKey) {
    return { sent: false, skippedReason: 'no_api_key', to };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to,
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!res.ok) {
      return { sent: false, skippedReason: 'send_failed', to };
    }
    return { sent: true, to };
  } catch {
    return { sent: false, skippedReason: 'send_failed', to };
  }
}
