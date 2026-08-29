// Email delivery via Resend's HTTP API (no SDK needed).
// Not configured (no RESEND_API_KEY) is a supported state: callers get
// { sent: false } and fall back to logging the link server-side, so the
// reset flow works for the operator before a sending domain exists.

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Without a verified domain, Resend only delivers from its sandbox
// sender (and only to the account owner). Set EMAIL_FROM once the
// domain is verified, e.g. "SquareSZN <no-reply@squareszn.com>".
function getFromAddress() {
  return process.env.EMAIL_FROM || 'SquareSZN <onboarding@resend.dev>';
}

async function resendPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }
  return response.json().catch(() => ({}));
}

async function sendEmail({ to, subject, html, headers }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'email-not-configured' };
  }
  await resendPost(RESEND_URL, {
    from: getFromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(headers ? { headers } : {})
  });
  return { sent: true };
}

// Up to 100 fully-formed email objects ({ from, to, subject, html, ... })
// per call — Resend's batch limit.
async function sendBatchEmails(emails) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'email-not-configured' };
  }
  if (emails.length === 0) return { sent: true, count: 0 };
  if (emails.length > 100) {
    throw new Error('sendBatchEmails: max 100 emails per batch');
  }
  await resendPost(RESEND_BATCH_URL, emails);
  return { sent: true, count: emails.length };
}

async function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your SquareSZN password',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
        <h2 style="margin:0 0 14px">Reset your password</h2>
        <p style="line-height:1.6;color:#444">
          Someone (hopefully you) asked to reset the password for this email address.
          The link below works once and expires in 30 minutes.
        </p>
        <p style="margin:26px 0">
          <a href="${resetUrl}"
             style="background:linear-gradient(135deg,#ff7a18,#ff2d55);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:bold;display:inline-block">
            Choose a new password
          </a>
        </p>
        <p style="font-size:13px;color:#777;line-height:1.6">
          If the button doesn't work, paste this into your browser:<br>
          <a href="${resetUrl}" style="color:#ff5a28;word-break:break-all">${resetUrl}</a>
        </p>
        <p style="font-size:13px;color:#777">Didn't request this? You can safely ignore it.</p>
      </div>
    `
  });
}

module.exports = {
  isEmailConfigured,
  getFromAddress,
  sendEmail,
  sendBatchEmails,
  sendPasswordResetEmail
};
