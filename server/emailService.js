// Email delivery via Resend's HTTP API (no SDK needed).
// Not configured (no RESEND_API_KEY) is a supported state: callers get
// { sent: false } and fall back to logging the link server-side, so the
// reset flow works for the operator before a sending domain exists.

const RESEND_URL = 'https://api.resend.com/emails';

async function sendPasswordResetEmail(to, resetUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'email-not-configured' };
  }

  // Without a verified domain, Resend only delivers from its sandbox
  // sender (and only to the account owner). Set EMAIL_FROM once the
  // domain is verified, e.g. "SquareSZN <no-reply@squareszn.com>".
  const from = process.env.EMAIL_FROM || 'SquareSZN <onboarding@resend.dev>';

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to: [to],
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
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return { sent: true };
}

module.exports = { sendPasswordResetEmail };
