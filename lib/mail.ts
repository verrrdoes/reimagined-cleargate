import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { LIMITS } from '@/lib/constants';
import type { DigestEmail } from '@/lib/officeAutomation';

/**
 * Sends the password-reset link (§8.1). Uses Resend when RESEND_API_KEY is set. Without it the email is
 * not sent: the server logs that email is not configured, and logs the link itself only outside production.
 * Returns whether the email was handed to the provider. Never throws.
 */
export async function sendPasswordReset(to: string, link: string): Promise<boolean> {
  const { RESEND_API_KEY, MAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.warn('ClearGate: email is not configured (RESEND_API_KEY is empty), so the password reset email was not sent.');
    if (process.env.NODE_ENV !== 'production') console.info(`ClearGate: password reset link for ${to}: ${link}`);
    return false;
  }

  const minutes = LIMITS.resetTokenMinutes;
  const text = [
    'Someone asked to reset the password for your ClearGate account.',
    '',
    `Open this link to choose a new password. It works once and expires in ${minutes} minutes:`,
    link,
    '',
    'If you did not ask for this, you can ignore this email. Your password stays the same.',
  ].join('\n');
  const html = `<p>Someone asked to reset the password for your ClearGate account.</p>
<p>Open this link to choose a new password. It works once and expires in ${minutes} minutes:</p>
<p><a href="${escapeHtml(link)}">Reset my password</a></p>
<p style="color:#5d6168">If the button does not work, copy this address into your browser:<br>${escapeHtml(link)}</p>
<p style="color:#5d6168">If you did not ask for this, you can ignore this email. Your password stays the same.</p>`;

  return deliver(RESEND_API_KEY, MAIL_FROM, { to, subject: 'Reset your ClearGate password', text, html }, 'password reset');
}

/**
 * Sends an office's morning email (lib/officeAutomation.ts) to one staff address. Without RESEND_API_KEY it is
 * not sent: the server logs that, and prints the email outside production. Returns whether it was handed to the
 * provider. Never throws.
 */
export async function sendOfficeDigest(to: string, email: DigestEmail): Promise<boolean> {
  const { RESEND_API_KEY, MAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.warn('ClearGate: email is not configured (RESEND_API_KEY is empty), so the office morning email was not sent.');
    if (process.env.NODE_ENV !== 'production') console.info(`ClearGate: morning email for ${to}:\n${email.subject}\n\n${email.text}`);
    return false;
  }
  return deliver(RESEND_API_KEY, MAIL_FROM, { to, ...email }, 'office morning');
}

async function deliver(
  apiKey: string,
  from: string,
  message: { to: string; subject: string; text: string; html: string },
  what: string,
): Promise<boolean> {
  try {
    const { error } = await new Resend(apiKey).emails.send({ from, ...message });
    if (error) {
      console.error(`ClearGate: the ${what} email could not be sent:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`ClearGate: the ${what} email could not be sent:`, e);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
