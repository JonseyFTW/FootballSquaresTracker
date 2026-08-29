const { test } = require('node:test');
const assert = require('node:assert');
const {
  isInSeason,
  isSeasonStartWindow,
  campaignsForToday,
  planCampaignSends,
  pickFeaturedGame,
  weeklyEmail,
  seasonStartEmail
} = require('./emailCampaigns');

const game = (id, away, home, state = 'pre', date = '2026-09-13T17:00:00Z') => ({
  id,
  name: `${away} at ${home}`,
  state,
  date,
  away: { name: away, abbreviation: away.slice(0, 3).toUpperCase(), score: 0 },
  home: { name: home, abbreviation: home.slice(0, 3).toUpperCase(), score: 0 }
});

// ----- schedule -----

test('isInSeason covers preseason through the Super Bowl', () => {
  assert.strictEqual(isInSeason(new Date('2026-08-01T15:00:00Z')), true);
  assert.strictEqual(isInSeason(new Date('2026-11-15T15:00:00Z')), true);
  assert.strictEqual(isInSeason(new Date('2027-01-20T15:00:00Z')), true);
  assert.strictEqual(isInSeason(new Date('2027-02-15T15:00:00Z')), true);
  assert.strictEqual(isInSeason(new Date('2027-02-16T15:00:00Z')), false);
  assert.strictEqual(isInSeason(new Date('2027-04-10T15:00:00Z')), false);
});

test('campaignsForToday: weekly on in-season Tuesdays only', () => {
  // 2026-10-06 is a Tuesday
  assert.deepStrictEqual(campaignsForToday(new Date('2026-10-06T15:00:00Z')), ['weekly']);
  // Wednesday: nothing
  assert.deepStrictEqual(campaignsForToday(new Date('2026-10-07T15:00:00Z')), []);
  // Tuesday in March: out of season
  assert.deepStrictEqual(campaignsForToday(new Date('2027-03-02T15:00:00Z')), []);
});

test('campaignsForToday: season-start window in early August', () => {
  assert.deepStrictEqual(campaignsForToday(new Date('2026-08-03T15:00:00Z')), ['season-start']);
  // 2026-08-04 is a Tuesday inside the window: both campaigns run
  assert.deepStrictEqual(campaignsForToday(new Date('2026-08-04T15:00:00Z')), ['season-start', 'weekly']);
  assert.strictEqual(isSeasonStartWindow(new Date('2026-08-11T15:00:00Z')), false);
});

// ----- per-user planning -----

const NOW = new Date('2026-10-06T15:00:00Z');

test('planCampaignSends: weekly goes to board creators, skips opt-outs', () => {
  const users = [
    { id: 'u1', email: 'a@x.com' },
    { id: 'u2', email: 'b@x.com', emailOptOut: true },
    { id: 'u3', email: 'c@x.com' }, // never created a board
    { id: 'u4' } // no email
  ];
  const plan = planCampaignSends({
    now: NOW,
    users,
    ownerIds: new Set(['u1', 'u2']),
    campaigns: ['weekly']
  });
  assert.deepStrictEqual(plan.map(p => p.user.id), ['u1']);
  assert.strictEqual(plan[0].campaign, 'weekly');
});

test('planCampaignSends: weekly dedupes recent sends', () => {
  const users = [
    { id: 'u1', email: 'a@x.com', lastWeeklyEmailAt: '2026-10-05T15:00:00Z' },
    { id: 'u2', email: 'b@x.com', lastWeeklyEmailAt: '2026-09-22T15:00:00Z' }
  ];
  const plan = planCampaignSends({
    now: NOW,
    users,
    ownerIds: new Set(['u1', 'u2']),
    campaigns: ['weekly']
  });
  assert.deepStrictEqual(plan.map(p => p.user.id), ['u2']);
});

test('planCampaignSends: season-start goes to everyone once a year and wins over weekly', () => {
  const now = new Date('2026-08-04T15:00:00Z');
  const users = [
    { id: 'u1', email: 'a@x.com' }, // board creator, not yet welcomed
    { id: 'u2', email: 'b@x.com', seasonStartEmailYear: 2026 }, // already welcomed, gets weekly
    { id: 'u3', email: 'c@x.com', seasonStartEmailYear: 2025 } // welcomed last year, no boards
  ];
  const plan = planCampaignSends({
    now,
    users,
    ownerIds: new Set(['u1', 'u2']),
    campaigns: ['season-start', 'weekly']
  });
  assert.deepStrictEqual(
    plan.map(p => `${p.user.id}:${p.campaign}`),
    ['u1:season-start', 'u2:weekly', 'u3:season-start']
  );
});

// ----- featured game -----

test('pickFeaturedGame is deterministic for a seed and prefers pre-game', () => {
  const games = [
    game('1', 'Bills', 'Chiefs', 'post'),
    game('2', 'Vikings', 'Broncos', 'pre'),
    game('3', 'Cowboys', 'Eagles', 'pre')
  ];
  const first = pickFeaturedGame(games, '2026-10-06');
  const second = pickFeaturedGame(games, '2026-10-06');
  assert.strictEqual(first.id, second.id);
  assert.strictEqual(first.state, 'pre');
});

test('pickFeaturedGame falls back to any game, and to null when empty', () => {
  const finished = [game('1', 'Bills', 'Chiefs', 'post')];
  assert.strictEqual(pickFeaturedGame(finished, 'seed').id, '1');
  assert.strictEqual(pickFeaturedGame([], 'seed'), null);
});

// ----- templates -----

test('weeklyEmail includes the featured matchup, CTA, and unsubscribe link', () => {
  const featured = game('2', 'Minnesota Vikings', 'Denver Broncos');
  const { subject, html } = weeklyEmail({
    user: { id: 'u1', name: 'Chad Jones', email: 'a@x.com' },
    featured,
    games: [featured, game('3', 'Dallas Cowboys', 'Philadelphia Eagles')],
    origin: 'https://squareszn.com',
    unsubUrl: 'https://squareszn.com/api/email/unsubscribe?token=T'
  });
  assert.match(subject, /Minnesota Vikings @ Denver Broncos/);
  assert.match(html, /Hey Chad/);
  assert.match(html, /https:\/\/squareszn\.com\/create/);
  assert.match(html, /unsubscribe\?token=T/);
  assert.match(html, /Dallas Cowboys @ Philadelphia Eagles/);
});

test('weeklyEmail escapes HTML in names', () => {
  const featured = game('2', 'Vikings<script>', 'Broncos');
  const { html } = weeklyEmail({
    user: { id: 'u1', name: '<img src=x>', email: 'a@x.com' },
    featured,
    games: [featured],
    origin: 'https://squareszn.com',
    unsubUrl: 'https://squareszn.com/u'
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x>'));
});

test('seasonStartEmail includes CTA and unsubscribe link', () => {
  const { subject, html } = seasonStartEmail({
    user: { id: 'u1', name: 'Chad', email: 'a@x.com' },
    origin: 'https://squareszn.com',
    unsubUrl: 'https://squareszn.com/api/email/unsubscribe?token=T'
  });
  assert.match(subject, /Football is back/);
  assert.match(html, /https:\/\/squareszn\.com\/create/);
  assert.match(html, /unsubscribe\?token=T/);
});
