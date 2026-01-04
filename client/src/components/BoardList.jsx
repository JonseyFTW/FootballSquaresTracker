import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function BoardList() {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoards()
  }, [])

  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards')
      const data = await response.json()
      setBoards(data)
    } catch (error) {
      console.error('Error fetching boards:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteBoard = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this board?')) return

    try {
      await fetch(`/api/boards/${id}`, { method: 'DELETE' })
      setBoards(boards.filter(b => b.id !== id))
    } catch (error) {
      console.error('Error deleting board:', error)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
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
      {boards.map(board => (
        <div
          key={board.id}
          className="board-card"
          onClick={() => navigate(`/board/${board.id}`)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>{board.name}</h3>
              <p>{board.type} Grid • {board.type === '5x5' ? '25' : '100'} Squares</p>
              <div className="teams">
                <span className="team-badge x-team">{board.xTeamName}</span>
                <span className="team-badge y-team">{board.yTeamName}</span>
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
          {board.currentScore && (
            <p style={{ marginTop: '10px', color: '#8892b0' }}>
              Score: {board.xTeamName} {board.currentScore.xTeam} - {board.yTeamName} {board.currentScore.yTeam}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default BoardList
