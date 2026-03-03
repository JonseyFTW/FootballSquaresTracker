import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'

function BoardView() {
  const { id } = useParams()
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mySquares, setMySquares] = useState('')
  const [mySquareNumbers, setMySquareNumbers] = useState([])
  const [winningCombinations, setWinningCombinations] = useState([])
  const [currentWinner, setCurrentWinner] = useState(null)
  const [editingSquare, setEditingSquare] = useState(null)
  const [editOwnerValue, setEditOwnerValue] = useState('')
  const [scoreX, setScoreX] = useState(0)
  const [scoreY, setScoreY] = useState(0)
  const [gamePhase, setGamePhase] = useState('pre-game')

  useEffect(() => {
    fetchBoard()
  }, [id])

  useEffect(() => {
    if (board) {
      setScoreX(board.currentScore?.xTeam || 0)
      setScoreY(board.currentScore?.yTeam || 0)
      setGamePhase(board.gamePhase || 'pre-game')
    }
  }, [board])

  const fetchBoard = async () => {
    try {
      const response = await fetch(`/api/boards/${id}`)
      const data = await response.json()
      setBoard(data)
    } catch (error) {
      console.error('Error fetching board:', error)
    } finally {
      setLoading(false)
    }
  }

  const trackMySquares = async () => {
    if (!mySquares.trim()) return

    const squareNums = mySquares.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    setMySquareNumbers(squareNums)

    try {
      const response = await fetch(`/api/boards/${id}/my-squares?squares=${squareNums.join(',')}`)
      const data = await response.json()
      setWinningCombinations(data.winningCombinations)
      setCurrentWinner(data.currentWinner)
    } catch (error) {
      console.error('Error tracking squares:', error)
    }
  }

  const updateScore = async () => {
    try {
      const response = await fetch(`/api/boards/${id}/score`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xTeam: scoreX, yTeam: scoreY, gamePhase })
      })
      const data = await response.json()
      setBoard(data)

      // Re-check winning status if tracking squares
      if (mySquareNumbers.length > 0) {
        trackMySquares()
      }
    } catch (error) {
      console.error('Error updating score:', error)
    }
  }

  const updateSquareOwner = async () => {
    if (!editingSquare) return

    try {
      const response = await fetch(`/api/boards/${id}/squares/${editingSquare}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: editOwnerValue })
      })
      const data = await response.json()
      setBoard(data)
      setEditingSquare(null)
      setEditOwnerValue('')
    } catch (error) {
      console.error('Error updating owner:', error)
    }
  }

  // Calculate winning square based on current score (skip pre-game)
  const winningSquare = useMemo(() => {
    if (!board || !board.currentScore) return null
    if (board.gamePhase === 'pre-game') return null

    const xLastDigit = board.currentScore.xTeam % 10
    const yLastDigit = board.currentScore.yTeam % 10

    for (const square of board.squares) {
      let xDigits, yDigits

      if (board.type === 'strip-10') {
        // Strip-10: digits stored directly on square
        xDigits = square.xDigits || []
        yDigits = square.yDigits || []
      } else if (board.type === '5x5') {
        const { row, col } = square
        xDigits = [board.xAxis[col * 2], board.xAxis[col * 2 + 1]]
        yDigits = [board.yAxis[row * 2], board.yAxis[row * 2 + 1]]
      } else {
        const { row, col } = square
        xDigits = [board.xAxis[col]]
        yDigits = [board.yAxis[row]]
      }

      if (xDigits.includes(xLastDigit) && yDigits.includes(yLastDigit)) {
        return square.number
      }
    }

    return null
  }, [board])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="empty-state">
        <h2>Board Not Found</h2>
        <p>The board you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">Back to Boards</Link>
      </div>
    )
  }

  const gridSize = board.type === '5x5' ? 5 : (board.type === 'strip-10' ? 10 : 10)

  // Render strip-10 layout
  const renderStripGrid = () => {
    return (
      <div className="strip-grid">
        {board.squares.map((square) => {
          const isHighlighted = mySquareNumbers.includes(square.number)
          const isWinning = winningSquare === square.number

          return (
            <div
              key={`square-${square.number}`}
              className={`strip-square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''}`}
              onClick={() => {
                setEditingSquare(square.number)
                setEditOwnerValue(square.owner || '')
              }}
            >
              <div className="strip-square-header">
                <span className="square-number">#{square.number}</span>
              </div>
              <div className="strip-digits">
                <div className="strip-digit-group x-digits">
                  <span className="digit-label">{board.xTeamName}:</span>
                  <span className="digit-values">{(square.xDigits || []).join(', ')}</span>
                </div>
                <div className="strip-digit-group y-digits">
                  <span className="digit-label">{board.yTeamName}:</span>
                  <span className="digit-values">{(square.yDigits || []).join(', ')}</span>
                </div>
              </div>
              <div className="strip-owner">
                {square.owner || 'Available'}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Build a lookup map for O(1) square access by position
  const squaresByPos = useMemo(() => {
    if (!board || board.type === 'strip-10') return {}
    const map = {}
    for (const square of board.squares) {
      map[`${square.row}-${square.col}`] = square
    }
    return map
  }, [board])

  const renderGrid = () => {
    const rows = []

    // Header row with X-axis numbers
    const headerRow = [
      <div key="corner" className="grid-header corner"></div>
    ]

    for (let col = 0; col < gridSize; col++) {
      if (board.type === '5x5') {
        headerRow.push(
          <div key={`header-${col}`} className="grid-header x-header">
            <span className="digit">{board.xAxis[col * 2]}</span>
            <span className="digit">{board.xAxis[col * 2 + 1]}</span>
          </div>
        )
      } else {
        headerRow.push(
          <div key={`header-${col}`} className="grid-header x-header">
            <span className="digit">{board.xAxis[col]}</span>
          </div>
        )
      }
    }
    rows.push(headerRow)

    // Data rows
    for (let row = 0; row < gridSize; row++) {
      const rowCells = []

      // Y-axis header
      if (board.type === '5x5') {
        rowCells.push(
          <div key={`y-header-${row}`} className="grid-header y-header">
            <span className="digit">{board.yAxis[row * 2]}</span>
            <span className="digit">{board.yAxis[row * 2 + 1]}</span>
          </div>
        )
      } else {
        rowCells.push(
          <div key={`y-header-${row}`} className="grid-header y-header">
            <span className="digit">{board.yAxis[row]}</span>
          </div>
        )
      }

      // Squares
      for (let col = 0; col < gridSize; col++) {
        const square = squaresByPos[`${row}-${col}`]
        if (!square) continue

        const isHighlighted = mySquareNumbers.includes(square.number)
        const isWinning = winningSquare === square.number

        rowCells.push(
          <div
            key={`square-${square.number}`}
            className={`square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''}`}
            onClick={() => {
              setEditingSquare(square.number)
              setEditOwnerValue(square.owner || '')
            }}
          >
            <span className="square-number">{square.number}</span>
            <span className="square-owner">{square.owner || '-'}</span>
          </div>
        )
      }

      rows.push(rowCells)
    }

    return rows.map((row, idx) => (
      <div key={idx} style={{ display: 'contents' }}>
        {row}
      </div>
    ))
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <Link to="/" className="btn btn-secondary">← Back to Boards</Link>
      </div>

      <h2 style={{ marginBottom: '20px', fontSize: '1.8rem' }}>{board.name}</h2>

      <div className="score-display">
        <div className="score-board">
          <div className="team-score">
            <div className="team-name">{board.xTeamName}</div>
            <div className="score-value x-team">{board.currentScore?.xTeam || 0}</div>
          </div>
          <div className="score-separator">-</div>
          <div className="team-score">
            <div className="team-name">{board.yTeamName}</div>
            <div className="score-value y-team">{board.currentScore?.yTeam || 0}</div>
          </div>
        </div>
        <div className="game-phase">{gamePhase}</div>
        {winningSquare && (
          <div style={{ marginTop: '15px', color: '#2ecc71', fontWeight: 600 }}>
            Current Winning Square: #{winningSquare}
            {board.squares.find(s => s.number === winningSquare)?.owner && (
              <span> ({board.squares.find(s => s.number === winningSquare)?.owner})</span>
            )}
          </div>
        )}
      </div>

      <div className="board-container">
        {board.type === 'strip-10' ? (
          <div className="strip-wrapper">
            <div className="strip-header">
              <span className="strip-info">
                Each square covers 5 {board.xTeamName} digits and 2 {board.yTeamName} digits (10 winning combinations per square)
              </span>
            </div>
            {renderStripGrid()}
          </div>
        ) : (
          <div className="grid-wrapper">
            <div className="team-labels">
              <span className="x-team-label">{board.xTeamName}</span>
            </div>
            <div className="grid-with-y-label">
              <div className="y-team-label">{board.yTeamName}</div>
              <div className={`squares-grid grid-${board.type}`}>
                {renderGrid()}
              </div>
            </div>
          </div>
        )}

        <div className="sidebar">
          {/* My Squares Tracker */}
          <div className="card">
            <h3>Track My Squares</h3>
            <div className="my-squares-input">
              <input
                type="text"
                placeholder="Enter square #s (e.g., 1, 5, 12)"
                value={mySquares}
                onChange={(e) => setMySquares(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && trackMySquares()}
              />
              <button className="btn btn-primary" onClick={trackMySquares}>
                Track
              </button>
            </div>

            {currentWinner && (
              <div className="current-winner">
                <h4>YOU'RE WINNING!</h4>
                <p>Square #{currentWinner.squareNumber}</p>
              </div>
            )}

            {winningCombinations.length > 0 && (
              <div className="winning-combinations">
                <h4 style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#8892b0' }}>
                  What You Need to Win:
                </h4>
                {winningCombinations.map((combo, idx) => (
                  <div key={idx} className="combination-item">
                    <div className="combination-header">
                      <span style={{ fontSize: '0.8rem', color: '#8892b0' }}>Square #{combo.squareNumber}</span>
                      <div className="combination-digits">
                        <span className="x-digit">{board.xTeamName}: {combo.xTeamDigit}</span>
                        <span className="y-digit">{board.yTeamName}: {combo.yTeamDigit}</span>
                      </div>
                    </div>
                    <div className="example-scores">
                      {combo.exampleScores.map((score, sIdx) => (
                        <span key={sIdx} className="example-score">
                          {score.x}-{score.y}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Score Controls */}
          <div className="card">
            <h3>Update Score</h3>
            <div className="score-controls">
              <div className="score-input-group">
                <label>{board.xTeamName}</label>
                <input
                  type="number"
                  min="0"
                  value={scoreX}
                  onChange={(e) => setScoreX(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="score-input-group">
                <label>{board.yTeamName}</label>
                <input
                  type="number"
                  min="0"
                  value={scoreY}
                  onChange={(e) => setScoreY(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <select
              className="phase-select"
              value={gamePhase}
              onChange={(e) => setGamePhase(e.target.value)}
            >
              <option value="pre-game">Pre-Game</option>
              <option value="1st Quarter">1st Quarter</option>
              <option value="2nd Quarter">2nd Quarter</option>
              <option value="Halftime">Halftime</option>
              <option value="3rd Quarter">3rd Quarter</option>
              <option value="4th Quarter">4th Quarter</option>
              <option value="Overtime">Overtime</option>
              <option value="Final">Final</option>
            </select>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={updateScore}>
              Update Score
            </button>
          </div>

          {/* Prizes */}
          {board.prizes && (board.prizes.q1 || board.prizes.half || board.prizes.q3 || board.prizes.final) && (
            <div className="card">
              <h3>Prizes</h3>
              <div className="prizes-display">
                {board.prizes.q1 > 0 && (
                  <div className="prize-item">
                    <div className="period">1st Quarter</div>
                    <div className="amount">${board.prizes.q1}</div>
                  </div>
                )}
                {board.prizes.half > 0 && (
                  <div className="prize-item">
                    <div className="period">Halftime</div>
                    <div className="amount">${board.prizes.half}</div>
                  </div>
                )}
                {board.prizes.q3 > 0 && (
                  <div className="prize-item">
                    <div className="period">3rd Quarter</div>
                    <div className="amount">${board.prizes.q3}</div>
                  </div>
                )}
                {board.prizes.final > 0 && (
                  <div className="prize-item">
                    <div className="period">Final</div>
                    <div className="amount">${board.prizes.final}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Owner Modal */}
      {editingSquare && (
        <div className="modal-overlay" onClick={() => setEditingSquare(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Square #{editingSquare}</h3>
            <input
              type="text"
              placeholder="Enter owner name"
              value={editOwnerValue}
              onChange={(e) => setEditOwnerValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && updateSquareOwner()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingSquare(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={updateSquareOwner}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BoardView
