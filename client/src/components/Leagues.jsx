import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useTitle } from '../useTitle'

function Leagues() {
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  useTitle('My Leagues')

  useEffect(() => {
    const load = async () => {
      const { ok, data } = await apiFetch('/api/leagues')
      if (ok) setLeagues(data)
      setLoading(false)
    }
    load()
  }, [])

  const createLeague = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const { ok, data } = await apiFetch('/api/leagues', {
        method: 'POST',
        body: JSON.stringify({ name, description })
      })
      if (!ok) {
        setError(data.error || 'Failed to create league')
        return
      }
      navigate(`/league/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="leagues-page">
      <div className="card" style={{ maxWidth: '700px', margin: '0 auto 20px' }}>
        <h3>Start a League</h3>
        <p className="live-hint">
          Perfect for Facebook groups: create a league, add your players, spin up a squares
          game for each NFL matchup, and share a view-only link with the group.
        </p>
        <form className="create-board-form" onSubmit={createLeague}>
          <div className="form-group">
            <label>League Name</label>
            <input
              type="text"
              placeholder="e.g., Smithville Squares Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              placeholder="e.g., Weekly squares for the neighborhood group"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
          {error && <div className="track-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </div>

      {leagues.filter(l => l.role !== 'member').length > 0 && (
        <div className="board-list" style={{ maxWidth: '700px', margin: '0 auto' }}>
          {leagues.filter(l => l.role !== 'member').map(league => (
            <div key={league.id} className="board-card" onClick={() => navigate(`/league/${league.id}`)}>
              <h3>
                {league.name}
                {league.pendingJoinCount > 0 && (
                  <span className="pending-pill"> {league.pendingJoinCount} join request{league.pendingJoinCount === 1 ? '' : 's'}</span>
                )}
              </h3>
              {league.description && <p>{league.description}</p>}
              <p style={{ marginTop: '6px' }}>
                {(league.joinedMembers || []).filter(m => m.status === 'active').length + (league.members || []).length} member{((league.joinedMembers || []).filter(m => m.status === 'active').length + (league.members || []).length) === 1 ? '' : 's'} ·
                created {new Date(league.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {leagues.some(l => l.role === 'member') && (
        <div style={{ maxWidth: '700px', margin: '30px auto 0' }}>
          <h3 style={{ fontWeight: 800, marginBottom: '12px' }}>Leagues you've joined</h3>
          <div className="board-list">
            {leagues.filter(l => l.role === 'member').map(league => (
              <div key={league.id} className="board-card" onClick={() => navigate(`/league/share/${league.shareToken}`)}>
                <h3>
                  {league.name}
                  {league.membership === 'pending' && <span className="pending-pill"> approval pending</span>}
                </h3>
                {league.description && <p>{league.description}</p>}
                <p style={{ marginTop: '6px' }}>
                  Run by {league.ownerName || 'the commissioner'} — tap to see this week's boards
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Leagues
