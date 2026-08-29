// Player and commissioner notifications for the claiming flow. Email goes
// through Resend (already configured for campaigns); push goes through Web
// Push when VAPID keys are set. Both are best-effort: a notification
// failure never fails the action that triggered it.

const storage = require('./storage');
const { sendEmail, isEmailConfigured } = require('./emailService');

let webpush = null;
function getWebPush() {
  if (webpush) return webpush;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return null;
  webpush = require('web-push');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:no-reply@squareszn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return webpush;
}

function isPushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Send to every device the user subscribed; prune subscriptions the push
// service says are gone (410/404).
async function sendPushToUser(user, payload) {
  const push = getWebPush();
  if (!push || !user || !(user.pushSubscriptions || []).length) return;

  const body = JSON.stringify(payload);
  const alive = [];
  for (const sub of user.pushSubscriptions) {
    try {
      await push.sendNotification(sub, body);
      alive.push(sub);
    } catch (err) {
      if (err.statusCode !== 404 && err.statusCode !== 410) {
        alive.push(sub); // transient failure — keep the subscription
        console.error('Push send failed:', err.statusCode || err.message);
      }
    }
  }
  if (alive.length !== user.pushSubscriptions.length) {
    user.pushSubscriptions = alive;
    try { await storage.saveUser(user); } catch (err) { /* prune next time */ }
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PAYMENT_LABELS = { venmo: 'Venmo', paypal: 'PayPal', zelle: 'Zelle', cashapp: 'Cash App', other: 'Other' };

function paymentBlockHtml(paymentMethods, amountOwed) {
  if (!(paymentMethods || []).length) return '';
  const rows = paymentMethods.map(m =>
    `<li style="margin:4px 0"><strong>${escapeHtml(PAYMENT_LABELS[m.type] || m.type)}:</strong> ${escapeHtml(m.handle)}</li>`
  ).join('');
  return `
    <p style="line-height:1.6;color:#444;margin-top:18px">
      ${amountOwed > 0 ? `<strong>You owe $${amountOwed}.</strong> ` : ''}Pay the commissioner directly:
    </p>
    <ul style="color:#444;line-height:1.5;padding-left:20px;margin:6px 0 0">${rows}</ul>
  `;
}

// Player got a square (approved or auto-accepted) — or a waitlist spot
// opened up for them. Transactional: sent regardless of marketing opt-out.
async function notifySquareAssigned({ user, board, squareNumbers, amountOwed, paymentMethods, origin, reason = 'approved' }) {
  const boardUrl = `${origin}/share/${board.shareToken}`;
  const squaresText = squareNumbers.map(n => `#${n}`).join(', ');
  const title = reason === 'waitlist'
    ? `A square opened up — you got ${squaresText}`
    : `You're in! Square ${squaresText} on ${board.name}`;

  if (user.email && isEmailConfigured()) {
    try {
      await sendEmail({
        to: user.email,
        subject: `🏈 ${title}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 14px">${escapeHtml(title)}</h2>
            <p style="line-height:1.6;color:#444">
              ${reason === 'waitlist'
                ? `You were next on the waitlist for <strong>${escapeHtml(board.name)}</strong>, and square ${escapeHtml(squaresText)} is now yours.`
                : `The commissioner confirmed your square${squareNumbers.length > 1 ? 's' : ''} ${escapeHtml(squaresText)} on <strong>${escapeHtml(board.name)}</strong>.`}
              It's already being tracked on your stats page, and you'll see it light up live during the game.
            </p>
            ${paymentBlockHtml(paymentMethods, amountOwed)}
            <p style="margin:26px 0">
              <a href="${boardUrl}"
                 style="background:linear-gradient(135deg,#ff7a18,#ff2d55);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:bold;display:inline-block">
                View the board
              </a>
            </p>
          </div>
        `
      });
    } catch (err) {
      console.error('Approval email failed:', err.message);
    }
  }

  await sendPushToUser(user, { title: `🏈 ${title}`, body: board.name, url: boardUrl });
}

// Commissioners get at most one email per board/league per hour, however
// many requests pile up — the in-app requests card is the live view.
const DIGEST_INTERVAL_MS = 60 * 60 * 1000;

async function notifyOwnerOfPending({ ownerId, subjectEntity, kind, count, url, origin }) {
  const now = Date.now();
  const last = subjectEntity.lastPendingEmailAt ? new Date(subjectEntity.lastPendingEmailAt).getTime() : 0;
  if (now - last < DIGEST_INTERVAL_MS) return false;

  const owner = await storage.getUserById(ownerId);
  if (!owner) return false;

  subjectEntity.lastPendingEmailAt = new Date(now).toISOString();

  const what = kind === 'join' ? 'join request' : 'square request';
  const title = `${count} pending ${what}${count === 1 ? '' : 's'} on ${subjectEntity.name}`;
  if (owner.email && isEmailConfigured()) {
    try {
      await sendEmail({
        to: owner.email,
        subject: `🏈 ${title}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 14px">${escapeHtml(title)}</h2>
            <p style="line-height:1.6;color:#444">People are waiting on you — approve or deny with one tap.</p>
            <p style="margin:26px 0">
              <a href="${origin}${url}"
                 style="background:linear-gradient(135deg,#ff7a18,#ff2d55);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:bold;display:inline-block">
                Review requests
              </a>
            </p>
          </div>
        `
      });
    } catch (err) {
      console.error('Owner digest email failed:', err.message);
    }
  }
  await sendPushToUser(owner, { title: `🏈 ${title}`, body: 'Tap to review', url: `${origin}${url}` });
  return true; // caller saves the entity (timestamp changed)
}

module.exports = {
  isPushConfigured,
  sendPushToUser,
  notifySquareAssigned,
  notifyOwnerOfPending
};
