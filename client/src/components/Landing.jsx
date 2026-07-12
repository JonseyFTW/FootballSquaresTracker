import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'

const DEMO_X = [7, 3, 0, 4, 1]
const DEMO_Y = [4, 1, 8, 0, 6]
const DEMO_OWNERS = {
  '0-0': 'Mia', '0-3': 'Sam', '0-4': 'Chad', '1-1': 'Ray',
  '2-2': 'Ana', '2-0': 'Lee', '3-3': 'Kim', '3-1': 'Joe',
  '4-4': 'Tia', '4-2': 'Max', '0-1': 'Dee', '2-4': 'Gus'
}
// Score 21-14 → last digits 1 (x) and 4 (y) → column with 1, row with 4
const WINNER = '0-4'

const FEATURES = [
  {
    icon: '📡',
    title: 'Live NFL scores',
    text: 'Link any board to a real game and the score, quarter, and winning square update themselves every 30 seconds. No more refreshing ESPN in another tab.'
  },
  {
    icon: '🏟️',
    title: 'Leagues for your group',
    text: 'Made for Facebook groups: one league, your whole roster, a fresh board for every game — Thursday, Sunday, and Monday matchups are one tap away.'
  },
  {
    icon: '🎲',
    title: 'Provably fair draws',
    text: 'Fill the squares first, then draw the numbers on-site. Choose how many times it shuffles — every run is saved and shown, so nobody argues with the draw.'
  },
  {
    icon: '💵',
    title: 'Payment tracking',
    text: 'Set a price per square and check people off as they pay. Collected and outstanding totals stay current so game day has no awkward math.'
  },
  {
    icon: '🔗',
    title: 'Share links that just work',
    text: 'Post one view-only link to the group. Everyone watches the board live on any phone — and only you can change anything.'
  },
  {
    icon: '📈',
    title: 'Lifetime player stats',
    text: 'Players can track their squares across every pool they join: wins, win rate, winnings, and net — bragging rights, quantified.'
  }
]

const STEPS = [
  { n: '1', title: 'Pick the game', text: "Every NFL matchup that week is listed — pick one and live scoring is wired up instantly." },
  { n: '2', title: 'Fill the squares', text: 'Assign squares as your group claims them, with your roster autocompleting names.' },
  { n: '3', title: 'Draw the numbers', text: 'Run the on-site randomizer as many times as your group likes — the final run locks it in.' },
  { n: '4', title: 'Share & watch live', text: 'Drop the link in your group. Winners light up automatically, every quarter.' }
]

function Landing() {
  const { user, authLoading } = useAuth()
  useTitle(null)

  // Returning users land straight in their app
  if (!authLoading && user) {
    return <Navigate to="/boards" replace />
  }

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">🏈 Free for game day</div>
          <h1>
            Run your football squares <span className="grad-text">like a pro</span>
          </h1>
          <p className="hero-lede">
            Create a board in seconds, draw numbers everyone trusts, track who's paid,
            and watch every square light up with <strong>live NFL scores</strong> — no
            spreadsheets, no screenshots, no arguments.
          </p>
          <div className="hero-ctas">
            <Link to="/register" className="btn btn-primary btn-lg">Start Free</Link>
            <Link to="/boards" className="btn btn-secondary btn-lg">See a live board</Link>
          </div>
          <p className="hero-trust">Free to play and watch · Works on any phone · Live scores via ESPN</p>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="demo-board">
            <div className="demo-score-chip">
              <span className="demo-live-dot"></span> LIVE · Q3 &nbsp;21–14
            </div>
            <div className="demo-grid">
              <div className="demo-cell demo-corner"></div>
              {DEMO_X.map((d, i) => <div key={`x${i}`} className="demo-cell demo-head">{d}</div>)}
              {DEMO_Y.map((yd, row) => (
                [
                  <div key={`y${row}`} className="demo-cell demo-head">{yd}</div>,
                  ...DEMO_X.map((xd, col) => {
                    const key = `${row}-${col}`
                    const winner = key === WINNER
                    return (
                      <div key={key} className={`demo-cell ${winner ? 'demo-winner' : ''}`}>
                        {DEMO_OWNERS[key] || ''}
                      </div>
                    )
                  })
                ]
              ))}
            </div>
            <div className="demo-caption">🏆 Chad is winning the 3rd quarter</div>
          </div>
          <div className="demo-chip demo-chip-a">🎲 5 shuffles · provably fair</div>
          <div className="demo-chip demo-chip-b">💵 18/25 squares paid</div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <h2 className="section-title">Everything a squares commissioner needs</h2>
        <p className="section-sub">Built around the way real groups actually run their pools.</p>
        <div className="features">
          {FEATURES.map(feature => (
            <div key={feature.title} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="steps-section">
        <h2 className="section-title">Game day in four steps</h2>
        <div className="steps">
          {STEPS.map(step => (
            <div key={step.n} className="step">
              <div className="step-number">{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="cta-band">
        <h2>Your group's next squares pool starts here</h2>
        <p>Set up takes about a minute. The trash talk lasts all season.</p>
        <Link to="/register" className="btn btn-primary btn-lg">Create Your Free Account</Link>
      </section>
    </div>
  )
}

export default Landing
