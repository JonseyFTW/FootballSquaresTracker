// Lifecycle emails that bring commissioners back to the site:
//  - "weekly": every Tuesday during football season (preseason through the
//    Super Bowl), sent to users who have created at least one board,
//    featuring one of that week's games as a prompt to spin up a new board.
//  - "season-start": once a year in early August, sent to every account,
//    announcing that football is back.
// A single daily cron hits runDailyCampaigns; this module decides what (if
// anything) goes out today. All date math is UTC — the cron fires mid-day
// UTC so the US calendar date matches.

const storage = require('./storage');
const auth = require('./authService');
const { getScoreboard } = require('./nflService');
const { sendEmail, sendBatchEmails, isEmailConfigured, getFromAddress } = require('./emailService');

const WEEKLY_SEND_DAY_UTC = 2; // Tuesday: after MNF, before the TNF slate
const WEEKLY_DEDUPE_MS = 5 * 24 * 60 * 60 * 1000;
const SEASON_START_WINDOW = { month: 7, firstDay: 1, lastDay: 10 }; // Aug 1–10
const BATCH_SIZE = 100; // Resend's per-call batch limit

function defaultSendCap() {
  const cap = parseInt(process.env.EMAIL_DAILY_CAP, 10);
  return Number.isFinite(cap) && cap > 0 ? cap : 1000;
}

// Football season for email purposes: preseason (August) through the
// Super Bowl (mid-February).
function isInSeason(now) {
  const month = now.getUTCMonth();
  if (month >= 7) return true; // Aug–Dec
  if (month === 0) return true; // Jan
  return month === 1 && now.getUTCDate() <= 15; // Feb 1–15
}

function isSeasonStartWindow(now) {
  return now.getUTCMonth() === SEASON_START_WINDOW.month &&
    now.getUTCDate() >= SEASON_START_WINDOW.firstDay &&
    now.getUTCDate() <= SEASON_START_WINDOW.lastDay;
}

function campaignsForToday(now) {
  const campaigns = [];
  if (isSeasonStartWindow(now)) campaigns.push('season-start');
  if (now.getUTCDay() === WEEKLY_SEND_DAY_UTC && isInSeason(now)) campaigns.push('weekly');
  return campaigns;
}

// Decide which campaign (at most one) each user gets today. Season-start
// wins for anyone not yet welcomed this year; dedupe fields on the user
// record keep the at-most-once-daily cron from double-sending.
function planCampaignSends({ now, users, ownerIds, campaigns }) {
  const year = now.getUTCFullYear();
  const plan = [];

  for (const user of users) {
    if (!user || !user.email || user.emailOptOut) continue;

    if (campaigns.includes('season-start') && user.seasonStartEmailYear !== year) {
      plan.push({ user, campaign: 'season-start' });
      continue;
    }

    if (campaigns.includes('weekly') && ownerIds.has(user.id)) {
      const last = user.lastWeeklyEmailAt ? new Date(user.lastWeeklyEmailAt).getTime() : 0;
      if (now.getTime() - last > WEEKLY_DEDUPE_MS) {
        plan.push({ user, campaign: 'weekly' });
      }
    }
  }

  return plan;
}

// Deterministic pick so every recipient sees the same featured game in a
// given week: hash the seed, prefer games that haven't kicked off yet.
function pickFeaturedGame(games, seed) {
  const candidates = (games || []).filter(g => g && g.state === 'pre');
  const pool = candidates.length > 0 ? candidates : (games || []).filter(Boolean);
  if (pool.length === 0) return null;

  let hash = 2166136261;
  for (const ch of String(seed)) {
    hash = (hash ^ ch.charCodeAt(0)) * 16777619 >>> 0;
  }
  return pool[hash % pool.length];
}

function weekSeed(now) {
  return now.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatKickoff(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(iso)) + ' ET';
  } catch (err) {
    return '';
  }
}

function firstName(user) {
  return String(user.name || '').trim().split(/\s+/)[0] || 'there';
}

// Shared shell: light background (safest across email clients), brand
// gradient button, unsubscribe footer (required for marketing email).
function emailLayout({ heading, bodyHtml, ctaUrl, ctaLabel, unsubUrl }) {
  const postal = process.env.EMAIL_POSTAL_ADDRESS
    ? `<p style="font-size:12px;color:#999;margin:6px 0 0">${escapeHtml(process.env.EMAIL_POSTAL_ADDRESS)}</p>`
    : '';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:15px;font-weight:bold;margin:0 0 18px">🏈 Square<span style="color:#ff5a28">SZN</span></p>
      <h2 style="margin:0 0 14px">${heading}</h2>
      ${bodyHtml}
      <p style="margin:26px 0">
        <a href="${ctaUrl}"
           style="background:linear-gradient(135deg,#ff7a18,#ff2d55);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:bold;display:inline-block">
          ${ctaLabel}
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:26px 0 14px">
      <p style="font-size:12px;color:#999;line-height:1.6;margin:0">
        You're getting this because you have a SquareSZN account.
        <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>
      </p>
      ${postal}
    </div>
  `;
}

function weeklyEmail({ user, featured, games, origin, unsubUrl }) {
  const matchup = featured ? `${featured.away.name} @ ${featured.home.name}` : 'This week\'s slate';
  const kickoff = featured ? formatKickoff(featured.date) : '';

  const others = (games || [])
    .filter(g => g && g !== featured && g.state === 'pre')
    .slice(0, 8)
    .map(g => `<li style="margin:4px 0">${escapeHtml(g.away.name)} @ ${escapeHtml(g.home.name)}${g.date ? ` · ${formatKickoff(g.date)}` : ''}</li>`)
    .join('');

  const bodyHtml = `
    <p style="line-height:1.6;color:#444">
      Hey ${escapeHtml(firstName(user))} — got your boards up for this week?
      ${featured ? `<strong>${escapeHtml(matchup)}</strong>${kickoff ? ` kicks off ${escapeHtml(kickoff)}` : ''} and it takes about a minute to set up a squares board with live scores, automatic winners, and payment tracking.` : 'It takes about a minute to set up a squares board with live scores, automatic winners, and payment tracking.'}
    </p>
    ${others ? `<p style="color:#444;margin:18px 0 6px"><strong>Also this week:</strong></p><ul style="color:#444;line-height:1.5;padding-left:20px;margin:0">${others}</ul>` : ''}
  `;

  return {
    subject: featured
      ? `🏈 ${matchup} this week — get your squares board up`
      : '🏈 This week\'s games are set — get your squares board up',
    html: emailLayout({
      heading: featured ? `This week: ${escapeHtml(matchup)}` : 'This week\'s NFL slate is set',
      bodyHtml,
      ctaUrl: `${origin}/create`,
      ctaLabel: 'Create a board',
      unsubUrl
    })
  };
}

function seasonStartEmail({ user, origin, unsubUrl }) {
  const bodyHtml = `
    <p style="line-height:1.6;color:#444">
      Hey ${escapeHtml(firstName(user))} — football is back, and SquareSZN is ready
      for your squares. Boards with live NFL scores, fair on-site number draws,
      automatic winning squares, and payment tracking — no spreadsheets, no
      screenshot reposts.
    </p>
    <p style="line-height:1.6;color:#444">
      Preseason games count too: spin up a board for this week and get your
      group back in the habit before Week 1.
    </p>
  `;

  return {
    subject: '🏈 Football is back — SquareSZN is ready for your squares',
    html: emailLayout({
      heading: 'Football is back',
      bodyHtml,
      ctaUrl: `${origin}/create`,
      ctaLabel: 'Start this season\'s first board',
      unsubUrl
    })
  };
}

function buildEmailFor({ user, campaign, featured, games, origin }) {
  const token = auth.signUnsubscribeToken(user.id);
  const unsubUrl = `${origin}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const content = campaign === 'weekly'
    ? weeklyEmail({ user, featured, games, origin, unsubUrl })
    : seasonStartEmail({ user, origin, unsubUrl });

  return {
    from: getFromAddress(),
    to: [user.email],
    subject: content.subject,
    html: content.html,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };
}

async function runDailyCampaigns({ now = new Date(), origin, dryRun = false }) {
  const campaigns = campaignsForToday(now);
  if (campaigns.length === 0) {
    return { ran: false, reason: 'no-campaign-today', date: now.toISOString() };
  }

  const users = await storage.getAllUsers();
  const ownerIds = new Set((await storage.getAllBoards()).map(b => b.ownerId).filter(Boolean));

  // The weekly email needs the slate; if ESPN is down, skip weekly today
  // rather than sending an empty email (season-start needs no games).
  let games = [];
  let featured = null;
  let effective = campaigns;
  if (campaigns.includes('weekly')) {
    try {
      games = (await getScoreboard()).games || [];
      featured = pickFeaturedGame(games, weekSeed(now));
    } catch (err) {
      console.error('Weekly email: failed to load scoreboard, skipping weekly:', err.message);
      effective = campaigns.filter(c => c !== 'weekly');
    }
  }

  let plan = planCampaignSends({ now, users, ownerIds, campaigns: effective });

  const cap = defaultSendCap();
  let capped = false;
  if (plan.length > cap) {
    console.warn(`Email campaigns: ${plan.length} recipients exceeds cap ${cap}; sending first ${cap}`);
    plan = plan.slice(0, cap);
    capped = true;
  }

  const counts = plan.reduce((acc, p) => {
    acc[p.campaign] = (acc[p.campaign] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    ran: true,
    date: now.toISOString(),
    campaigns: effective,
    recipients: counts,
    featuredGame: featured ? featured.name : null,
    emailConfigured: isEmailConfigured(),
    capped
  };

  if (dryRun) return { ...summary, dryRun: true };
  if (plan.length === 0) return { ...summary, sent: 0 };
  if (!isEmailConfigured()) {
    console.log(`[email-campaigns] RESEND_API_KEY not set — would have sent ${plan.length} email(s)`);
    return { ...summary, sent: 0, reason: 'email-not-configured' };
  }

  const emails = plan.map(p => buildEmailFor({ ...p, featured, games, origin }));

  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    try {
      await sendBatchEmails(chunk);
      sent += chunk.length;
    } catch (err) {
      console.error('Batch send failed, falling back to singles:', err.message);
      for (const email of chunk) {
        try {
          await sendEmail(email);
          sent++;
        } catch (singleErr) {
          console.error(`Failed to email ${email.to[0]}:`, singleErr.message);
        }
      }
    }
  }

  // Mark everyone in the attempted plan so a cron retry today doesn't
  // re-send to the whole list over an isolated failure.
  const year = now.getUTCFullYear();
  for (const { user, campaign } of plan) {
    if (campaign === 'weekly') user.lastWeeklyEmailAt = now.toISOString();
    else user.seasonStartEmailYear = year;
    try {
      await storage.saveUser(user);
    } catch (err) {
      console.error(`Failed to record send for ${user.id}:`, err.message);
    }
  }

  return { ...summary, sent };
}

module.exports = {
  isInSeason,
  isSeasonStartWindow,
  campaignsForToday,
  planCampaignSends,
  pickFeaturedGame,
  weekSeed,
  weeklyEmail,
  seasonStartEmail,
  runDailyCampaigns
};
