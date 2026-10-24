import 'server-only';

/**
 * Email delivery boundary. Uses Resend's HTTP API when RESEND_API_KEY and
 * EMAIL_FROM are set; otherwise reports "not configured" so callers can mark
 * the notification as skipped instead of pretending it was sent.
 */
export type EmailResult = { status: 'sent'; id: string } | { status: 'skipped'; reason: string } | { status: 'failed'; error: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  if (!emailConfigured()) return { status: 'skipped', reason: 'Email provider not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: 'failed', error: body.message ?? `HTTP ${res.status}` };
    return { status: 'sent', id: body.id ?? '' };
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'Network error' };
  }
}
