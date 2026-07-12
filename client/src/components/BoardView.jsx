import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'

const PERIODS = [
  { key: 'q1', label: '1st Quarter' },
  { key: 'half', label: 'Halftime' },
  { key: 'q3', label: '3rd Quarter' },
  { key: 'final', label: 'Final' }
]

const parseSquareNumbers = (input) =>
  [...new Set(input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)))]

const parseDigitList = (input) =>
  [...new Set(input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0 && n <= 9))]
    .sort((a, b) => a - b)

function BoardView() {
  const { id } = useParams()
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mySquares, setMySquares] = useState('')
  const [mySquareNumbers, setMySquareNumbers] = useState([])
  const [trackError, setTrackError] = useState(null)
  const [winningCombinations, setWinningCombinations] = useState([])
  const [currentWinners, setCurrentWinners] = useState([])
  const [editingSquare, setEditingSquare] = useState(null)
  const [editOwnerValue, setEditOwnerValue] = useState('')
  const [editXDigits, setEditXDigits] = useState('')
  const [editYDigits, setEditYDigits] = useState('')
  const [editError, setEditError] = useState(null)
  const [scoreX, setScoreX] = useState('0')
  const [scoreY, setScoreY] = useState('0')
  const [gamePhase, setGamePhase] = useState('pre-game')
  const [recordingPeriod, setRecordingPeriod] = useState(null)

  const storageKey = `fst-my-squares-${id}`

  useEffect(() => {
    // Reset everything when navigating between boards
    setLoading(true)
    setBoard(null)
    setMySquares('')
    setMySquareNumbers([])
    setWinningCombinations([])
    setCurrentWinners([])
    setTrackError(null)
    fetchBoard()
  }, [id])

  useEffect(() => {
    if (board) {
      setScoreX(String(board.currentScore?.xTeam ?? 0))
      setScoreY(String(board.currentScore?.yTeam ?? 0))
      setGamePhase(board.gamePhase || 'pre-game')
    }
  }, [board])

  const fetchBoard = async () => {
    try {
      const response = await fetch(`/api/boards/${id}`)
      if (!response.ok) {
        setBoard(null)
        return
      }
      const data = await response.json()
      setBoard(data)

      // Restore tracked squares from the last visit
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setMySquares(saved)
        trackSquares(saved)
      }
    } catch (error) {
      console.error('Error fetching board:', error)
    } finally {
      setLoading(false)
    }
  }

  const trackSquares = async (input) => {
    const squareNums = parseSquareNumbers(input)
    setMySquareNumbers(squareNums)
    setTrackError(null)

    if (squareNums.length === 0) {
      setWinningCombinations([])
      setCurrentWinners([])
      localStorage.removeItem(storageKey)
      if (input.trim()) {
        setTrackError('Enter square numbers separated by commas, e.g. 1, 5, 12')
      }
      return
    }

    localStorage.setItem(storageKey, squareNums.join(', '))

    try {
      const response = await fetch(`/api/boards/${id}/my-squares?squares=${squareNums.join(',')}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setTrackError(data.error || 'Failed to look up your squares')
        return
      }
      setWinningCombinations(data.winningCombinations || [])
      setCurrentWinners(data.currentWinners || [])
    } catch (error) {
      console.error('Error tracking squares:', error)
      setTrackError('Failed to look up your squares')
    }
  }

  const updateScore = async () => {
    const x = parseInt(scoreX, 10)
    const y = parseInt(scoreY, 10)

    try {
      const response = await fetch(`/api/boards/${id}/score`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xTeam: isNaN(x) ? 0 : x, yTeam: isNaN(y) ? 0 : y, gamePhase })
      })
      if (!response.ok) {
        console.error('Error updating score: server returned', response.status)
        return
      }
      const data = await response.json()
      setBoard(data)

      // Re-check winning status if tracking squares
      if (mySquareNumbers.length > 0) {
        trackSquares(mySquareNumbers.join(','))
      }
    } catch (error) {
      console.error('Error updating score:', error)
    }
  }

  const bumpScore = (setter, current, delta) => {
    const value = parseInt(current, 10) || 0
    setter(String(Math.max(0, value + delta)))
  }

  const openSquareEditor = (square) => {
    setEditingSquare(square.number)
    setEditOwnerValue(square.owner || '')
    setEditError(null)
    if (board.type === 'strip-10') {
      setEditXDigits((square.xDigits || []).join(', '))
      setEditYDigits((square.yDigits || []).join(', '))
    }
  }

  const closeSquareEditor = () => {
    setEditingSquare(null)
    setEditOwnerValue('')
    setEditXDigits('')
    setEditYDigits('')
    setEditError(null)
  }

  const updateSquare = async () => {
    if (!editingSquare) return

    const body = { owner: editOwnerValue }
    if (board.type === 'strip-10') {
      const xDigits = parseDigitList(editXDigits)
      const yDigits = parseDigitList(editYDigits)
      if (xDigits.length === 0 || yDigits.length === 0) {
        setEditError('Each team needs at least one digit between 0 and 9')
        return
      }
      body.xDigits = xDigits
      body.yDigits = yDigits
    }

    try {
      const response = await fetch(`/api/boards/${id}/squares/${editingSquare}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEditError(data.error || 'Failed to save square')
        return
      }
      setBoard(data)
      closeSquareEditor()

      // Owner names appear in tracked-square results; refresh them
      if (mySquareNumbers.length > 0) {
        trackSquares(mySquareNumbers.join(','))
      }
    } catch (error) {
      console.error('Error updating square:', error)
      setEditError('Failed to save square')
    }
  }

  const recordPeriodResult = async (period) => {
    const existing = board.periodResults?.[period.key]
    if (existing && !confirm(`Overwrite the recorded ${period.label} result?`)) return

    setRecordingPeriod(period.key)
    try {
      const response = await fetch(`/api/boards/${id}/period-result`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: period.key })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(data.error || 'Failed to record result')
        return
      }
      setBoard(data)
    } catch (error) {
      console.error('Error recording period result:', error)
    } finally {
      setRecordingPeriod(null)
    }
  }

  // All squares winning at the current score (legacy strip boards can
  // have more than one)
  const winningSquares = useMemo(() => {
    if (!board || !board.currentScore) return []
    if (board.gamePhase === 'pre-game') return []

    const xLastDigit = board.currentScore.xTeam % 10
    const yLastDigit = board.currentScore.yTeam % 10

    const winners = []
    for (const square of board.squares) {
      let xDigits, yDigits

      if (board.type === 'strip-10') {
        // Strip-10: digits stored directly on square
        xDigits = square.xDigits || []
        yDigits = square.yDigits || []
      } else if (board.type === '5x5') {
        const { row, col } = square
        if (row == null || col == null) continue
        xDigits = [board.xAxis[col * 2], board.xAxis[col * 2 + 1]]
        yDigits = [board.yAxis[row * 2], board.yAxis[row * 2 + 1]]
      } else {
        const { row, col } = square
        if (row == null || col == null) continue
        xDigits = [board.xAxis[col]]
        yDigits = [board.yAxis[row]]
      }

      if (xDigits.includes(xLastDigit) && yDigits.includes(yLastDigit)) {
        winners.push(square.number)
      }
    }

    return winners
  }, [board])

  // Build a lookup map for O(1) square access by position (must be before early returns - Rules of Hooks)
  const squaresByPos = useMemo(() => {
    if (!board || board.type === 'strip-10') return {}
    const map = {}
    for (const square of board.squares) {
      map[`${square.row}-${square.col}`] = square
    }
    return map
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

  const gridSize = board.type === '5x5' ? 5 : 10
  const isPreGame = board.gamePhase === 'pre-game'

  const winnerLabel = (num) => {
    const sq = board.squares.find(s => s.number === num)
    return `#${num}${sq?.owner ? ` (${sq.owner})` : ''}`
  }

  // Render strip-10 layout
  const renderStripGrid = () => {
    return (
      <div className="strip-grid">
        {board.squares.map((square) => {
          const isHighlighted = mySquareNumbers.includes(square.number)
          const isWinning = winningSquares.includes(square.number)

          return (
            <div
              key={`square-${square.number}`}
              className={`strip-square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''}`}
              onClick={() => openSquareEditor(square)}
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
        if (!square) {
          rowCells.push(<div key={`empty-${row}-${col}`} className="square empty" />)
          continue
        }

        const isHighlighted = mySquareNumbers.includes(square.number)
        const isWinning = winningSquares.includes(square.number)

        rowCells.push(
          <div
            key={`square-${square.number}`}
            className={`square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''}`}
            onClick={() => openSquareEditor(square)}
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
        <div className="game-phase">{board.gamePhase || 'pre-game'}</div>
        {winningSquares.length > 0 && (
          <div className="winning-banner">
            {winningSquares.length === 1 ? 'Current Winning Square: ' : 'Current Winning Squares: '}
            {winningSquares.map(winnerLabel).join(', ')}
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
            <div className="grid-scroll">
              <div className="grid-with-y-label">
                <div className="y-team-label">{board.yTeamName}</div>
                <div className={`squares-grid grid-${board.type}`}>
                  {renderGrid()}
                </div>
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
                onKeyDown={(e) => e.key === 'Enter' && trackSquares(mySquares)}
              />
              <button className="btn btn-primary" onClick={() => trackSquares(mySquares)}>
                Track
              </button>
            </div>

            {trackError && (
              <div className="track-error">{trackError}</div>
            )}

            {currentWinners.length > 0 && (
              <div className="current-winner">
                <h4>YOU'RE WINNING!</h4>
                {currentWinners.map(w => (
                  <p key={w.squareNumber}>
                    Square #{w.squareNumber}{w.owner ? ` — ${w.owner}` : ''}
                  </p>
                ))}
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
                  onChange={(e) => setScoreX(e.target.value)}
                />
                <div className="quick-score-buttons">
                  <button type="button" onClick={() => bumpScore(setScoreX, scoreX, 7)}>+7</button>
                  <button type="button" onClick={() => bumpScore(setScoreX, scoreX, 3)}>+3</button>
                  <button type="button" onClick={() => bumpScore(setScoreX, scoreX, 1)}>+1</button>
                </div>
              </div>
              <div className="score-input-group">
                <label>{board.yTeamName}</label>
                <input
                  type="number"
                  min="0"
                  value={scoreY}
                  onChange={(e) => setScoreY(e.target.value)}
                />
                <div className="quick-score-buttons">
                  <button type="button" onClick={() => bumpScore(setScoreY, scoreY, 7)}>+7</button>
                  <button type="button" onClick={() => bumpScore(setScoreY, scoreY, 3)}>+3</button>
                  <button type="button" onClick={() => bumpScore(setScoreY, scoreY, 1)}>+1</button>
                </div>
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

          {/* Prizes & Period Results */}
          <div className="card">
            <h3>Prizes & Results</h3>
            <div className="period-results">
              {PERIODS.map(period => {
                const amount = board.prizes?.[period.key] || 0
                const result = board.periodResults?.[period.key]
                const winnersText = result
                  ? (result.winners.length > 0
                      ? result.winners.map(w => w.owner || `#${w.squareNumber}`).join(', ')
                      : 'No winner')
                  : null

                return (
                  <div key={period.key} className="period-row">
                    <div className="period-info">
                      <span className="period">{period.label}</span>
                      {amount > 0 && <span className="amount">${amount}</span>}
                    </div>
                    <div className="period-result">
                      {result ? (
                        <span className="period-winner">
                          🏆 {winnersText}
                          <span className="period-score"> {result.score.xTeam}-{result.score.yTeam}</span>
                        </span>
                      ) : (
                        <span className="period-winner unrecorded">Not recorded</span>
                      )}
                      <button
                        type="button"
                        className="btn-record"
                        disabled={isPreGame || recordingPeriod === period.key}
                        title={isPreGame
                          ? 'Update the score and game phase first'
                          : (result ? 'Re-record with the current score' : 'Record the current score as this result')}
                        onClick={() => recordPeriodResult(period)}
                      >
                        {result ? '↻' : 'Record'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Square Modal */}
      {editingSquare && (
        <div className="modal-overlay" onClick={closeSquareEditor}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Square #{editingSquare}</h3>
            <input
              type="text"
              placeholder="Enter owner name"
              maxLength={60}
              value={editOwnerValue}
              onChange={(e) => setEditOwnerValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && updateSquare()}
              autoFocus
            />
            {board.type === 'strip-10' && (
              <>
                <label className="modal-label">{board.xTeamName} digits (usually 5)</label>
                <input
                  type="text"
                  placeholder="e.g. 0, 2, 4, 6, 8"
                  value={editXDigits}
                  onChange={(e) => setEditXDigits(e.target.value)}
                />
                <label className="modal-label">{board.yTeamName} digits (usually 2)</label>
                <input
                  type="text"
                  placeholder="e.g. 3, 7"
                  value={editYDigits}
                  onChange={(e) => setEditYDigits(e.target.value)}
                />
              </>
            )}
            {editError && <div className="modal-error">{editError}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeSquareEditor}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={updateSquare}>
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
