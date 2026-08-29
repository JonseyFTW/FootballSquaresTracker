import { useEffect, useMemo, useState } from 'react'
import { useTitle } from '../useTitle'

// Admin-only revenue model for metered board pricing. Pure math — every
// number derives from the sliders; nothing here talks to the API.

const STORAGE_KEY = 'fst-pricing-lab'

const DEFAULTS = {
  groups: 10,
  boardsPerGame: 3,
  gamesPerWeek: 15,
  preseason: true,
  playoffs: true,
  price: 1,
  billing: 'weekly',
  oneOffs: 200,
  oneOffPrice: 6,
  pool: 500,
  rakePct: 20,
  hosting: 25
}

// NFL calendar: 18 regular-season weeks averaging ~15.1 games, 49
// preseason games (HOF + 3 per team), 13 playoff games. A group covering
// g of ~15 weekly games is assumed to cover the same share of preseason.
const REG_WEEKS = 18
const REG_GAMES_PER_WEEK = 272 / 18
const PRESEASON_GAMES = 49
const PLAYOFF_GAMES = 13
const STRIPE_PCT = 0.029
const STRIPE_FIXED = 0.3

const money = (n, cents = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  }).format(n)
const num = (n) => new Intl.NumberFormat('en-US').format(Math.round(n))
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`

function compute(s) {
  const regGames = s.gamesPerWeek * REG_WEEKS
  const preGames = s.preseason ? Math.round(PRESEASON_GAMES * s.gamesPerWeek / REG_GAMES_PER_WEEK) : 0
  const postGames = s.playoffs ? Math.round(PLAYOFF_GAMES * Math.min(1, s.gamesPerWeek / 4)) : 0
  const seasonGames = regGames + preGames + postGames
  const weeksActive = REG_WEEKS + (s.preseason ? 3 : 0) + (s.playoffs ? 4 : 0)

  const boardsPerWeek = s.gamesPerWeek * s.boardsPerGame
  const seasonBoards = seasonGames * s.boardsPerGame

  const meterGross = s.groups * seasonBoards * s.price
  const oneOffGross = s.oneOffs * s.oneOffPrice
  const gross = meterGross + oneOffGross

  const meterCharges = s.billing === 'weekly' ? s.groups * weeksActive : s.groups * seasonBoards
  const charges = meterCharges + s.oneOffs
  const stripe = gross > 0 ? gross * STRIPE_PCT + charges * STRIPE_FIXED : 0
  const stripePct = gross > 0 ? stripe / gross : 0

  const hostingYear = s.hosting * 12
  const net = gross - stripe - hostingYear

  const weeklyFee = boardsPerWeek * s.price
  const weeklyRake = boardsPerWeek * s.pool * (s.rakePct / 100)
  const feeShare = weeklyRake > 0 ? weeklyFee / weeklyRake : 0

  return {
    seasonGames, preGames, postGames, weeksActive, boardsPerWeek, seasonBoards,
    meterGross, oneOffGross, gross, charges, stripe, stripePct, hostingYear, net,
    weeklyFee, weeklyRake, feeShare
  }
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved }
  } catch (err) { /* fresh defaults */ }
  return { ...DEFAULTS }
}

function Field({ id, label, value, min, max, step, display, onChange }) {
  return (
    <div className="plab-field">
      <div className="plab-field-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function PricingLab() {
  useTitle('Pricing Lab')
  const [s, setS] = useState(loadSaved)
  const [tip, setTip] = useState(null)
  const d = useMemo(() => compute(s), [s])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch (err) { /* private mode */ }
  }, [s])

  const set = (key) => (value) => setS(prev => ({ ...prev, [key]: value }))

  const schemes = useMemo(() => {
    const list = [{
      label: `${money(s.price, true)}/board`,
      you: true,
      rev: d.meterGross,
      perWeek: d.weeklyFee,
      perSeason: d.seasonBoards * s.price
    }]
    for (const p of [1, 2, 5]) {
      if (Math.abs(p - s.price) > 0.001) {
        list.push({
          label: `$${p.toFixed(2)}/board`,
          rev: s.groups * d.seasonBoards * p,
          perWeek: d.boardsPerWeek * p,
          perSeason: d.seasonBoards * p
        })
      }
    }
    list.push({ label: '$399 flat/season', rev: s.groups * 399, perWeek: 399 / d.weeksActive, perSeason: 399 })
    return list
  }, [s, d])

  const maxRev = Math.max(...schemes.map(x => x.rev), 1)
  const feeSharePct = Math.max(0.6, Math.min(100, d.feeShare * 100))

  const showTip = (scheme) => (e) => setTip({
    x: Math.min(e.clientX + 14, window.innerWidth - 260),
    y: e.clientY + 14,
    scheme
  })

  return (
    <div className="plab">
      <div className="plab-masthead">
        <h2>Pricing Lab</h2>
        <p>Drag the assumptions — revenue, Stripe drag, and the cost to your commissioners update live. Only admins see this page.</p>
      </div>

      <div className="plab-columns">
        <div className="plab-controls">
          <div className="card">
            <h3>The groups</h3>
            <Field id="groups" label="Paying groups" value={s.groups} min={1} max={100} step={1}
              display={s.groups} onChange={set('groups')} />
            <Field id="bpg" label="Boards per game" value={s.boardsPerGame} min={1} max={6} step={1}
              display={s.boardsPerGame} onChange={set('boardsPerGame')} />
            <Field id="gpw" label="Games covered per week" value={s.gamesPerWeek} min={1} max={16} step={1}
              display={`${s.gamesPerWeek} of ~15`} onChange={set('gamesPerWeek')} />
            <div className="plab-toggles">
              <label className={`plab-toggle ${s.preseason ? 'on' : ''}`}>
                <input type="checkbox" checked={s.preseason} onChange={(e) => set('preseason')(e.target.checked)} />
                Preseason
              </label>
              <label className={`plab-toggle ${s.playoffs ? 'on' : ''}`}>
                <input type="checkbox" checked={s.playoffs} onChange={(e) => set('playoffs')(e.target.checked)} />
                Playoffs + SB
              </label>
            </div>
            <p className="plab-hint">
              ≈ {num(d.seasonGames)} games billed per group: {num(s.gamesPerWeek * REG_WEEKS)} regular season
              {d.preGames ? ` + ${num(d.preGames)} preseason` : ''}
              {d.postGames ? ` + ${num(d.postGames)} playoff` : ''}.
            </p>
          </div>

          <div className="card">
            <h3>Your pricing</h3>
            <Field id="price" label="Price per board" value={s.price} min={0.25} max={10} step={0.25}
              display={money(s.price, true)} onChange={set('price')} />
            <div className="plab-field">
              <div className="plab-field-head"><label id="plab-bill-label">Billing</label></div>
              <div className="plab-seg" role="group" aria-labelledby="plab-bill-label">
                <button type="button" aria-pressed={s.billing === 'weekly'} onClick={() => set('billing')('weekly')}>
                  One charge / week
                </button>
                <button type="button" aria-pressed={s.billing === 'board'} onClick={() => set('billing')('board')}>
                  Charge per board
                </button>
              </div>
              <p className="plab-hint">
                Weekly batching is what keeps Stripe near 3% — the 30¢ fixed fee hits once per charge, not once per board.
              </p>
            </div>
            <Field id="oneoffs" label="Casual one-off boards / season" value={s.oneOffs} min={0} max={2000} step={25}
              display={num(s.oneOffs)} onChange={set('oneOffs')} />
            <Field id="oneoffPrice" label="One-off price" value={s.oneOffPrice} min={3} max={15} step={0.5}
              display={money(s.oneOffPrice, true)} onChange={set('oneOffPrice')} />
          </div>

          <div className="card">
            <h3>Their pools</h3>
            <Field id="pool" label="Average pool per board" value={s.pool} min={100} max={2000} step={50}
              display={money(s.pool)} onChange={set('pool')} />
            <Field id="rake" label="Their “donation” cut" value={s.rakePct} min={10} max={25} step={1}
              display={`${s.rakePct}%`} onChange={set('rakePct')} />
            <Field id="hosting" label="Your hosting / month" value={s.hosting} min={0} max={200} step={5}
              display={`${money(s.hosting)}/mo`} onChange={set('hosting')} />
          </div>
        </div>

        <div className="plab-results">
          <div className="plab-hero">
            <p className="plab-hero-cap">Season net profit — after Stripe and hosting</p>
            <p className="plab-hero-figure">{money(d.net)}</p>
            <p className="plab-hero-sub">
              <strong>{num(s.groups)}</strong> groups × <strong>{num(d.seasonBoards)}</strong> boards
              at <strong>{money(s.price, true)}</strong>/board = <strong>{money(d.meterGross)}</strong>,
              plus <strong>{money(d.oneOffGross)}</strong> in one-offs —
              minus <strong>{money(d.stripe)}</strong> Stripe and <strong>{money(d.hostingYear)}</strong> hosting.
            </p>
          </div>

          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{money(d.weeklyFee, true)}</span>
              <span className="stat-label">Fee per group / week</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{money(d.seasonBoards * s.price)}</span>
              <span className="stat-label">Fee per group / season</span>
            </div>
            <div className="stat-tile">
              <span className={`stat-value ${d.stripePct <= 0.04 ? 'net-up' : 'net-down'}`}>{pct(d.stripePct)}</span>
              <span className="stat-label">Stripe rate (aim &lt; 4%)</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{num(s.groups * d.seasonBoards + s.oneOffs)}</span>
              <span className="stat-label">Boards billed / season</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{money(d.gross)}</span>
              <span className="stat-label">Gross revenue / season</span>
            </div>
          </div>

          <div className="card">
            <h3>What it costs them</h3>
            <p className="plab-lede">
              A full week for one group: <strong>{num(d.boardsPerWeek)}</strong> boards
              pooling <strong>{money(d.boardsPerWeek * s.pool)}</strong>, of which their {s.rakePct}% cut
              is <strong>{money(d.weeklyRake)}</strong>. Your fee takes <strong>{pct(d.feeShare)}</strong> of that cut.
            </p>
            <div className="plab-split" aria-hidden="true">
              <div className="plab-split-fee" style={{ width: `${feeSharePct}%` }}></div>
              <div className="plab-split-keep"></div>
            </div>
            <div className="plab-split-legend">
              <span><span className="plab-swatch fee"></span>Your fee — <strong>{money(d.weeklyFee, true)}</strong>/wk</span>
              <span><span className="plab-swatch keep"></span>They keep — <strong>{money(Math.max(0, d.weeklyRake - d.weeklyFee))}</strong>/wk</span>
            </div>
          </div>

          <div className="card">
            <h3>Same usage, five ways to charge for it</h3>
            <p className="plab-lede">
              Season revenue from the metered groups at today's settings (one-off sales excluded so the schemes compare cleanly).
            </p>
            <div className="plab-bars">
              {schemes.map((x) => {
                const w = Math.max(1.2, x.rev / maxRev * 70)
                return (
                  <div
                    key={x.label}
                    className={`plab-bar-row ${x.you ? 'active' : ''}`}
                    onMouseMove={showTip(x)}
                    onMouseLeave={() => setTip(null)}
                  >
                    <span className="plab-bar-name">
                      {x.you && <span className="plab-you">Your setting</span>}
                      {x.label}
                    </span>
                    <span className="plab-bar-track">
                      <span className="plab-bar-fill" style={{ width: `${w}%` }}></span>
                      <span className="plab-bar-val" style={{ left: `calc(${w}% + 9px)` }}>{money(x.rev)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
            <details className="plab-tableview">
              <summary>View as table</summary>
              <div className="table-scroll">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Scheme</th>
                      <th className="num">Per group / week</th>
                      <th className="num">Per group / season</th>
                      <th className="num">All groups / season</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemes.map((x) => (
                      <tr key={x.label}>
                        <td>{x.label}{x.you ? ' (yours)' : ''}</td>
                        <td className="num">{money(x.perWeek, true)}</td>
                        <td className="num">{money(x.perSeason)}</td>
                        <td className="num">{money(x.rev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="card">
            <h3>How the math works</h3>
            <p className="plab-fineprint">
              <strong>Games:</strong> 18 regular-season weeks at your covered slate, plus 49 preseason games
              (scaled to your coverage) and 13 playoff games when toggled.{' '}
              <strong>Stripe:</strong> 2.9% + 30¢ per charge — weekly batching means {num(d.weeksActive)} charges
              per group per season instead of {num(d.seasonBoards)}; one-offs are charged individually.{' '}
              <strong>Hosting:</strong> billed all 12 months.{' '}
              <strong>Their side:</strong> pool × donation cut, benchmarked on a real example — a 10-spot at $58
              is a $580 pool paying out $500, an $80 (13.8%) keep. Everything scales linearly: half the games
              covered means half the revenue.
            </p>
          </div>
        </div>
      </div>

      {tip && (
        <div className="plab-tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.scheme.label}</strong><br />
          {money(tip.scheme.perWeek, true)} per group/week · {money(tip.scheme.perSeason)} per group/season<br />
          All {num(s.groups)} groups: <strong>{money(tip.scheme.rev)}</strong>
        </div>
      )}
    </div>
  )
}

export default PricingLab
