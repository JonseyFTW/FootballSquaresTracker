import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'

function LeagueView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [league, setLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [memberName, setMemberName] = useState('')
  const [memberError, setMemberError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { ok, data } = await apiFetch(`/api/leagues/${id}`)
      if (ok) setLeague(data)
      else setError(data.error || 'Failed to load league')
      setLoading(false)
    }
    load()
  }, [id])

  const addMember = async (e) => {
    e.preventDefault()
    setMemberError(null)
    const { ok, data } = await apiFetch(`/api/leagues/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ name: memberName })
    })
    if (!ok) {
      setMemberError(data.error || 'Failed to add member')
      return
    }
    setLeague(prev => ({ ...prev, members: data.members }))
    setMemberName('')
  }

  const removeMember = async (memberId) => {
    const { ok, data } = await apiFetch(`/api/leagues/${id}/members/${memberId}`, { method: 'DELETE' })
    if (ok) setLeague(prev => ({ ...prev, members: data.members }))
  }

  const deleteLeague = async () => {
    if (!confirm('Delete this league? Its games are kept, but they leave the league.')) return
    const { ok } = await apiFetch(`/api/leagues/${id}`, { method: 'DELETE' })
    if (ok) navigate('/leagues')
  }

  const shareUrl = league ? `${window.location.origin}/league/share/${league.shareToken}` : ''

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      prompt('Copy this link:', shareUrl)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!league) {
    return (
      <div className="empty-state">
        <h2>League Not Found</h2>
        <p>{error || "This league doesn't exist or isn't yours."}</p>
        <Link to="/leagues" className="btn btn-primary">Back to Leagues</Link>
      </div>
    )
  }

  const boards = league.boards || []

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <Link to="/leagues" className="btn btn-secondary">← My Leagues</Link>
      </div>

      <div className="league-header">
        <div>
          <h2 style={{ fontSize: '1.8rem' }}>{league.name}</h2>
          {league.description && <p style={{ color: '#8892b0', marginTop: '5px' }}>{league.description}</p>}
        </div>
        <div className="league-header-actions">
          <button className="btn btn-secondary" onClick={copyShareLink}>
            {copied ? '✓ Copied!' : '🔗 Copy Share Link'}
          </button>
          <button className="btn btn-primary" onClick={() => navigate(`/create?league=${league.id}`)}>
            + New Square Game
          </button>
        </div>
      </div>

      <p className="live-hint" style={{ marginBottom: '20px' }}>
        Post the share link in your Facebook group — everyone can watch every board live,
        but only you can make changes.
      </p>

      <div className="league-columns">
        <div className="league-games">
          <div className="card">
            <h3>Square Games</h3>
            {boards.length === 0 ? (
              <p className="live-hint">
                No games yet. Create one and pick this week's NFL matchup — live scores hook up automatically.
              </p>
            ) : (
              <div className="league-game-list">
                {boards.map(board => (
                  <div key={board.id} className="league-game-row" onClick={() => navigate(`/board/${board.id}`)}>
                    <div className="league-game-info">
                      <span className="league-game-name">{board.name}</span>
                      <span className="league-game-meta">
                        {board.xTeamName} vs {board.yTeamName} · {board.filledSquares}/{board.totalSquares} squares filled
                        {!board.axesDrawn && ' · numbers not drawn'}
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

        <div className="league-sidebar">
          <div className="card">
            <h3>Roster ({(league.members || []).length})</h3>
            <p className="live-hint">
              Add your group's players — their names autocomplete when you assign squares.
            </p>
            <form className="my-squares-input" onSubmit={addMember}>
              <input
                type="text"
                placeholder="Player name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                maxLength={60}
                required
              />
              <button type="submit" className="btn btn-primary">Add</button>
            </form>
            {memberError && <div className="track-error">{memberError}</div>}
            <div className="roster-list">
              {(league.members || []).map(member => (
                <div key={member.id} className="roster-row">
                  <span>{member.name}</span>
                  <button
                    className="roster-remove"
                    title="Remove from roster"
                    onClick={() => removeMember(member.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Danger Zone</h3>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={deleteLeague}>
              Delete League
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LeagueView
