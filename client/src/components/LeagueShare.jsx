import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'

// Public league page reached via share link — view-only.
function LeagueShare() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const result = await apiFetch(`/api/league-share/${token}`)
      if (result.ok) setData(result.data)
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!data) {
    return (
      <div className="empty-state">
        <h2>League Not Found</h2>
        <p>This share link doesn't match any league.</p>
        <Link to="/" className="btn btn-primary">Home</Link>
      </div>
    )
  }

  const { league, boards } = data

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="viewer-banner">
        👀 You're viewing <strong>{league.name}</strong> — boards are view-only.
        {!user && (
          <span> Want to track your squares and stats? <Link to="/register">Create a free account</Link>.</span>
        )}
      </div>

      <h2 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>{league.name}</h2>
      {league.description && <p style={{ color: '#8892b0' }}>{league.description}</p>}
      {league.ownerName && <p style={{ color: '#6c7a89', fontSize: '0.85rem', marginTop: '4px' }}>Run by {league.ownerName}</p>}

      <div className="card" style={{ marginTop: '20px' }}>
        <h3>Square Games</h3>
        {boards.length === 0 ? (
          <p className="live-hint">No games posted yet — check back soon.</p>
        ) : (
          <div className="league-game-list">
            {boards.map(board => (
              <div
                key={board.id}
                className="league-game-row"
                onClick={() => board.shareToken && navigate(`/share/${board.shareToken}`)}
              >
                <div className="league-game-info">
                  <span className="league-game-name">{board.name}</span>
                  <span className="league-game-meta">
                    {board.xTeamName} vs {board.yTeamName}
                    {board.currentScore && board.gamePhase !== 'pre-game' &&
                      ` · ${board.currentScore.xTeam}-${board.currentScore.yTeam}`}
                    {' · '}{board.filledSquares}/{board.totalSquares} squares filled
                  </span>
                </div>
                <span className={`live-badge ${board.gamePhase !== 'pre-game' ? (board.gamePhase === 'Final' ? 'post' : 'in') : ''}`}>
                  {board.gamePhase === 'pre-game' ? 'PRE-GAME' : board.gamePhase.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeagueShare
