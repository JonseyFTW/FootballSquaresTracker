import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function BoardList() {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoards()
  }, [])

  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards')
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data)) {
        setLoadError('Failed to load boards. Please try again.')
        return
      }
      setBoards(data)
    } catch (error) {
      console.error('Error fetching boards:', error)
      setLoadError('Failed to load boards. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const deleteBoard = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this board?')) return

    try {
      const response = await fetch(`/api/boards/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        alert('Failed to delete board')
        return
      }
      setBoards(boards.filter(b => b.id !== id))
    } catch (error) {
      console.error('Error deleting board:', error)
    }
  }

  const boardTypeLabel = (board) => {
    if (board.type === 'strip-10') return '10-Strip • 10 Squares'
    return `${board.type} Grid • ${board.type === '5x5' ? 25 : 100} Squares`
  }

  const createdLabel = (board) => {
    if (!board.createdAt) return null
    const date = new Date(board.createdAt)
    if (isNaN(date.getTime())) return null
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="empty-state">
        <h2>Something Went Wrong</h2>
        <p>{loadError}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); setLoadError(null); fetchBoards() }}>
          Retry
        </button>
      </div>
    )
  }

  if (boards.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Boards Yet</h2>
        <p>Create your first football squares board to get started!</p>
        <Link to="/create" className="btn btn-primary">
          Create Board
        </Link>
      </div>
    )
  }

  return (
    <div className="board-list">
      {boards.map(board => {
        const created = createdLabel(board)
        const inProgress = board.gamePhase && board.gamePhase !== 'pre-game'

        return (
          <div
            key={board.id}
            className="board-card"
            onClick={() => navigate(`/board/${board.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>{board.name}</h3>
                <p>
                  {boardTypeLabel(board)}
                  {created && <span> • Created {created}</span>}
                </p>
                <div className="teams">
                  <span className="team-badge x-team">{board.xTeamName}</span>
                  <span className="team-badge y-team">{board.yTeamName}</span>
                  {inProgress && <span className="team-badge phase">{board.gamePhase}</span>}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                onClick={(e) => deleteBoard(e, board.id)}
              >
                Delete
              </button>
            </div>
            {inProgress && board.currentScore && (
              <p style={{ marginTop: '10px', color: '#8892b0' }}>
                Score: {board.xTeamName} {board.currentScore.xTeam} - {board.yTeamName} {board.currentScore.yTeam}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default BoardList
