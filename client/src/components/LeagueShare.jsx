import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'

// The league's public page — and, for joined members, their home for the
// group's boards: scroll, spot an open one, grab a square.
function LeagueShare() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  useTitle(data ? data.league.name : 'League')

  const load = async () => {
    const result = await apiFetch(`/api/league-share/${token}`)
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setData(null)
      setError(result.data.error || 'League not found')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [token, user])

  const join = async () => {
    setJoining(true)
    try {
      const { ok, data: result } = await apiFetch(`/api/league-share/${token}/join`, { method: 'POST' })
      if (ok) {
        setData(prev => prev ? { ...prev, viewer: { ...prev.viewer, membership: result.membership } } : prev)
      }
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!data) {
    return (
      <div className="empty-state">
        <h2>{error === "You've been removed from this league." ? 'No Access' : 'League Not Found'}</h2>
        <p>{error || "This share link doesn't match any league."}</p>
        <Link to="/" className="btn btn-primary">Home</Link>
      </div>
    )
  }

  const { league, boards, viewer } = data
  const membership = viewer?.membership || null

  const membershipBanner = () => {
    if (viewer?.isOwner) return null
    if (!user) {
      return (
        <div className="viewer-banner">
          🏈 This is <strong>{league.name}</strong>'s squares HQ.{' '}
          <Link to={`/register?next=${encodeURIComponent(location.pathname)}`}>Create a free account</Link> or{' '}
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>sign in</Link> to join and grab squares.
        </div>
      )
    }
    if (membership === 'active') {
      return (
        <div className="viewer-banner member-banner">
          ✅ You're a member of <strong>{league.name}</strong> — open any board below and tap a square to claim it.
        </div>
      )
    }
    if (membership === 'pending') {
      return (
        <div className="viewer-banner">
          ⏳ Your join request is in — <strong>{league.ownerName || 'the commissioner'}</strong> approves new members.
        </div>
      )
    }
    return (
      <div className="viewer-banner">
        🏈 Join <strong>{league.name}</strong> to grab squares on its boards.{' '}
        <button className="btn btn-primary btn-small" onClick={join} disabled={joining} style={{ marginLeft: '6px' }}>
          {joining ? 'Joining…' : (league.joinMode === 'auto' ? 'Join League' : 'Request to Join')}
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {membershipBanner()}

      <h2 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>{league.name}</h2>
      {league.description && <p style={{ color: '#8892b0' }}>{league.description}</p>}
      {league.ownerName && <p style={{ color: '#6c7a89', fontSize: '0.85rem', marginTop: '4px' }}>Run by {league.ownerName}</p>}

      <div className="card" style={{ marginTop: '20px' }}>
        <h3>Square Games</h3>
        {boards.length === 0 ? (
          <p className="live-hint">No games posted yet — check back soon.</p>
        ) : (
          <div className="league-game-list">
            {boards.map(board => {
              const open = board.claimMode !== 'admin' && board.gamePhase === 'pre-game' && board.openSquares > 0
              const full = board.gamePhase === 'pre-game' && board.openSquares === 0
              return (
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
                  {open ? (
                    <span className="live-badge open-badge">OPEN · {board.openSquares} LEFT</span>
                  ) : full ? (
                    <span className="live-badge">FULL</span>
                  ) : (
                    <span className={`live-badge ${board.gamePhase !== 'pre-game' ? (board.gamePhase === 'Final' ? 'post' : 'in') : ''}`}>
                      {board.gamePhase === 'pre-game' ? 'PRE-GAME' : board.gamePhase.toUpperCase()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeagueShare
