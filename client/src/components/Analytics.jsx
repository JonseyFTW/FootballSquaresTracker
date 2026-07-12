import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'

const money = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

function Analytics() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useTitle('My Stats')

  useEffect(() => {
    const load = async () => {
      const result = await apiFetch('/api/me/analytics')
      if (result.ok) setData(result.data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!data) {
    return (
      <div className="empty-state">
        <h2>Couldn't Load Your Stats</h2>
        <p>Please try again in a moment.</p>
      </div>
    )
  }

  const { totals, wins, games } = data

  if (totals.gamesPlayed === 0) {
    return (
      <div className="empty-state">
        <h2>No Tracked Games Yet</h2>
        <p>
          Open any board (or a shared board link) and use <strong>Track My Squares</strong> —
          your games, wins, and winnings will build up here.
        </p>
        <Link to="/boards" className="btn btn-primary">Browse Boards</Link>
      </div>
    )
  }

  const net = totals.net
  const netSign = net > 0 ? '+' : net < 0 ? '−' : ''
  const winPct = `${Math.round(totals.winRate * 100)}%`

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>My Squares Stats</h2>
      <p style={{ color: '#8892b0', marginBottom: '20px' }}>
        {user?.name} · lifetime record across every game you've tracked
      </p>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-value">{totals.gamesPlayed}</span>
          <span className="stat-label">Games Played</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{totals.squaresTracked}</span>
          <span className="stat-label">Squares Owned</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{totals.wins}<span className="stat-sub">/{totals.periodsPlayed}</span></span>
          <span className="stat-label">Periods Won</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{winPct}</span>
          <span className="stat-label">Win Rate</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{money(totals.totalWinnings)}</span>
          <span className="stat-label">Total Won</span>
        </div>
        <div className="stat-tile">
          <span className={`stat-value ${net > 0 ? 'net-up' : net < 0 ? 'net-down' : ''}`}>
            {netSign}{money(Math.abs(net))}
          </span>
          <span className="stat-label">Net (won − spent)</span>
        </div>
      </div>

      {wins.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>🏆 Your Wins</h3>
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Period</th>
                  <th>Score</th>
                  <th>Square</th>
                  <th className="num">Prize</th>
                </tr>
              </thead>
              <tbody>
                {wins.map((win, idx) => (
                  <tr key={idx}>
                    <td>{win.boardName}<span className="table-sub"> · {win.teams}</span></td>
                    <td>{win.periodLabel}</td>
                    <td>{win.score ? `${win.score.xTeam}-${win.score.yTeam}` : '—'}</td>
                    <td>#{win.winningSquares.join(', #')}</td>
                    <td className="num">{money(win.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Game History</h3>
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Status</th>
                <th className="num">Squares</th>
                <th className="num">Spent</th>
                <th className="num">Periods Won</th>
                <th className="num">Won</th>
              </tr>
            </thead>
            <tbody>
              {games.map(game => (
                <tr key={game.boardId} className="clickable" onClick={() => navigate(`/board/${game.boardId}`)}>
                  <td>{game.boardName}<span className="table-sub"> · {game.teams}</span></td>
                  <td>{game.gamePhase === 'pre-game' ? 'Pre-game' : game.gamePhase}</td>
                  <td className="num">{game.squareCount}</td>
                  <td className="num">{game.spent > 0 ? money(game.spent) : '—'}</td>
                  <td className="num">{game.winCount}/{game.periods.length}</td>
                  <td className="num">{game.wonAmount > 0 ? money(game.wonAmount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Analytics
