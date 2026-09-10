import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ImageImport from './ImageImport'
import { apiFetch } from '../api'
import { useTitle } from '../useTitle'

function CreateBoard() {
  const navigate = useNavigate()
  const location = useLocation()
  const leagueId = new URLSearchParams(location.search).get('league')

  const [league, setLeague] = useState(null)
  useTitle('Create a Board')
  const [boardType, setBoardType] = useState('10x10')
  const [name, setName] = useState('')
  const [xTeamName, setXTeamName] = useState('')
  const [yTeamName, setYTeamName] = useState('')
  const [numbersMode, setNumbersMode] = useState('later') // 'later' | 'manual'
  const [claimMode, setClaimMode] = useState(leagueId ? 'approval' : 'admin')
  const [xAxis, setXAxis] = useState(Array(10).fill(''))
  const [yAxis, setYAxis] = useState(Array(10).fill(''))
  const [prizes, setPrizes] = useState({ q1: '', half: '', q3: '', final: '' })
  const [squarePrice, setSquarePrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [importedSquares, setImportedSquares] = useState(null)
  const [importedType, setImportedType] = useState(null)
  const [importWarnings, setImportWarnings] = useState([])
  const [importNotice, setImportNotice] = useState(null)
  const [showImport, setShowImport] = useState(false)

  // NFL week game picker
  const [nflGames, setNflGames] = useState([])
  const [nflLoading, setNflLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [xTeamSide, setXTeamSide] = useState('home')

  useEffect(() => {
    const loadGames = async () => {
      const { ok, data } = await apiFetch('/api/nfl/scoreboard')
      if (ok) setNflGames(data.games || [])
      setNflLoading(false)
    }
    loadGames()
  }, [])

  useEffect(() => {
    if (!leagueId) return
    const loadLeague = async () => {
      const { ok, data } = await apiFetch(`/api/leagues/${leagueId}`)
      if (ok) setLeague(data)
    }
    loadLeague()
  }, [leagueId])

  const selectedGame = nflGames.find(g => g.id === selectedGameId) || null

  const pickNflGame = (game) => {
    if (selectedGameId === game.id) {
      // Deselect
      setSelectedGameId(null)
      return
    }
    setSelectedGameId(game.id)
    applySides(game, xTeamSide)
    if (!name || name.endsWith('Squares')) {
      setName(`${game.away.name} vs ${game.home.name} Squares`)
    }
  }

  const applySides = (game, side) => {
    const x = side === 'home' ? game.home : game.away
    const y = side === 'home' ? game.away : game.home
    setXTeamName(x.name)
    setYTeamName(y.name)
  }

  const changeSide = (side) => {
    setXTeamSide(side)
    if (selectedGame) applySides(selectedGame, side)
  }

  const handleXAxisChange = (index, value) => {
    const newAxis = [...xAxis]
    newAxis[index] = value
    setXAxis(newAxis)
  }

  const handleYAxisChange = (index, value) => {
    const newAxis = [...yAxis]
    newAxis[index] = value
    setYAxis(newAxis)
  }

  const randomizeAxis = (setter) => {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]]
    }
    setter(digits.map(String))
  }

  const handleImportComplete = (data) => {
    setBoardType(data.type)
    setImportedType(data.type)
    setXTeamName(data.xTeamName)
    setYTeamName(data.yTeamName)
    setImportWarnings(data.warnings || [])
    setImportNotice(null)
    setSelectedGameId(null)

    if (data.type === 'strip-10') {
      setXAxis(Array(10).fill(''))
      setYAxis(Array(10).fill(''))
    } else {
      setNumbersMode('manual')
      setXAxis((data.xAxis || []).map(String))
      setYAxis((data.yAxis || []).map(String))
    }

    setPrizes({
      q1: data.prizes.q1 ? String(data.prizes.q1) : '',
      half: data.prizes.half ? String(data.prizes.half) : '',
      q3: data.prizes.q3 ? String(data.prizes.q3) : '',
      final: data.prizes.final ? String(data.prizes.final) : ''
    })
    setImportedSquares(data.squares)
    setShowImport(false)

    if (!name) {
      setName(`${data.xTeamName} vs ${data.yTeamName} Squares`)
    }
  }

  const handleBoardTypeChange = (newType) => {
    setBoardType(newType)
    if (importedSquares && newType !== importedType) {
      setImportedSquares(null)
      setImportedType(null)
      setImportWarnings([])
      setImportNotice('Imported squares were discarded because the board type changed. Import the image again if that was a mistake.')
    }
  }

  const filledSquareCount = importedSquares
    ? importedSquares.filter(sq => sq.owner && String(sq.owner).trim() !== '').length
    : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)

    if (!name || !xTeamName || !yTeamName) {
      setSubmitError('Please fill in all required fields')
      return
    }

    const usingManualNumbers = boardType !== 'strip-10' && numbersMode === 'manual'
    const xAxisNums = xAxis.map(Number)
    const yAxisNums = yAxis.map(Number)

    if (usingManualNumbers) {
      const validAxis = (axis) => {
        const sorted = [...axis].sort((a, b) => a - b)
        return sorted.every((val, idx) => val === idx)
      }
      if (!validAxis(xAxisNums) || !validAxis(yAxisNums)) {
        setSubmitError('Each axis must contain exactly the digits 0-9 (each digit once)')
        return
      }
    }

    setLoading(true)

    try {
      const boardPayload = {
        name,
        type: boardType,
        xTeamName,
        yTeamName,
        xAxis: usingManualNumbers ? xAxisNums : [],
        yAxis: usingManualNumbers ? yAxisNums : [],
        squarePrice: squarePrice ? parseFloat(squarePrice) : 0,
        prizes: {
          q1: prizes.q1 ? parseFloat(prizes.q1) : 0,
          half: prizes.half ? parseFloat(prizes.half) : 0,
          q3: prizes.q3 ? parseFloat(prizes.q3) : 0,
          final: prizes.final ? parseFloat(prizes.final) : 0
        }
      }

      if (leagueId) {
        boardPayload.leagueId = leagueId
      }

      if (selectedGame) {
        boardPayload.liveGame = { eventId: selectedGame.id, xTeamSide }
      }

      boardPayload.claimMode = claimMode

      if (importedSquares && importedSquares.length > 0) {
        boardPayload.squares = importedSquares
      } else if (boardType === 'strip-10' && numbersMode === 'later') {
        boardPayload.drawLater = true
      }

      const { ok, data } = await apiFetch('/api/boards', {
        method: 'POST',
        body: JSON.stringify(boardPayload)
      })

      if (ok) {
        navigate(`/board/${data.id}`)
      } else {
        setSubmitError(data.error || 'Error creating board')
      }
    } finally {
      setLoading(false)
    }
  }

  const gameStateLabel = (game) => {
    if (game.state === 'in') return game.detail
    if (game.state === 'post') return `Final ${game.away.score}-${game.home.score}`
    if (game.date) {
      return new Date(game.date).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      })
    }
    return ''
  }

  return (
    <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h3>{league ? `New Game in ${league.name}` : 'Create New Board'}</h3>
      {league && (
        <p className="import-notice" style={{ marginTop: '10px' }}>
          This game will belong to your league. Everyone with the league share link can watch it live.
        </p>
      )}

      {/* NFL week game picker */}
      <div className="nfl-picker">
        <h4>This Week's NFL Games</h4>
        <p className="live-hint">
          Pick the matchup — team names fill in and live scores connect automatically
          (Thursday, Sunday, and Monday games all show here).
        </p>
        {nflLoading ? (
          <div className="loading" style={{ minHeight: '60px' }}><div className="spinner"></div></div>
        ) : nflGames.length === 0 ? (
          <p className="live-hint">No NFL games scheduled this week — enter teams manually below.</p>
        ) : (
          <div className="game-list" style={{ maxHeight: '220px' }}>
            {nflGames.map(game => (
              <label key={game.id} className={`game-row ${selectedGameId === game.id ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedGameId === game.id}
                  onChange={() => pickNflGame(game)}
                />
                <span className="game-name">{game.name}</span>
                <span className="game-state">{gameStateLabel(game)}</span>
              </label>
            ))}
          </div>
        )}
        {selectedGame && (
          <div className="side-picker">
            <p>Which team goes on <strong>top</strong> (x-axis)?</p>
            <label>
              <input type="radio" name="create-side" checked={xTeamSide === 'home'} onChange={() => changeSide('home')} />
              {selectedGame.home.name} <span className="side-tag">home</span>
            </label>
            <label>
              <input type="radio" name="create-side" checked={xTeamSide === 'away'} onChange={() => changeSide('away')} />
              {selectedGame.away.name} <span className="side-tag">away</span>
            </label>
          </div>
        )}
      </div>

      {/* Image Import Section */}
      {showImport ? (
        <div className="import-section">
          <ImageImport onImportComplete={handleImportComplete} />
          <div className="import-divider">
            <span>or enter details manually</span>
          </div>
        </div>
      ) : importedSquares ? (
        <div className="import-summary">
          <div className="import-success">
            <span>
              Imported a {importedType === 'strip-10' ? '10-strip' : importedType} board — {xTeamName} vs {yTeamName},{' '}
              {filledSquareCount} of {importedSquares?.length || 0} squares have owners.
            </span>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowImport(true)}>
              Import Another
            </button>
          </div>
          {importWarnings.length > 0 && (
            <div className="import-warnings">
              <strong>Check these before creating the board:</strong>
              <ul>
                {importWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-small"
          style={{ marginBottom: '15px' }}
          onClick={() => setShowImport(true)}
        >
          📷 Import from an image instead
        </button>
      )}

      {importNotice && <div className="import-notice">{importNotice}</div>}

      <form className="create-board-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Board Name</label>
          <input
            type="text"
            placeholder="e.g., Week 1 Chiefs Game"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Board Type</label>
          <select value={boardType} onChange={(e) => handleBoardTypeChange(e.target.value)}>
            <option value="10x10">10x10 Grid (100 squares, 1 digit per cell)</option>
            <option value="5x5">5x5 Grid (25 squares, 2 digits per cell)</option>
            <option value="strip-10">10 Strip (10 squares, 5 digits for one team, 2 for other)</option>
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>X-Axis Team (Top)</label>
            <input
              type="text"
              placeholder="e.g., Chiefs"
              value={xTeamName}
              onChange={(e) => setXTeamName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Y-Axis Team (Left)</label>
            <input
              type="text"
              placeholder="e.g., 49ers"
              value={yTeamName}
              onChange={(e) => setYTeamName(e.target.value)}
              required
            />
          </div>
        </div>

        {boardType === 'strip-10' ? (
          <div className="axis-input-group">
            <h4 style={{ color: '#8892b0', margin: 0 }}>10-Strip Numbers</h4>
            <p style={{ color: '#8892b0', fontSize: '0.9rem', marginTop: '10px' }}>
              Each of the 10 squares gets 5 {xTeamName || 'X-Team'} numbers and 2 {yTeamName || 'Y-Team'} numbers
              (10 winning score combinations per square), distributed so every possible score has exactly one winner.
            </p>
            <div className="numbers-mode">
              <label className={numbersMode === 'later' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="numbers-mode"
                  checked={numbersMode === 'later'}
                  onChange={() => setNumbersMode('later')}
                />
                <span>
                  <strong>Draw numbers later</strong> (recommended) — people claim squares 1–10 first
                  with no numbers showing, then you run the draw from the board page (or type in a
                  draw you did elsewhere) once the board is full.
                </span>
              </label>
              <label className={numbersMode === 'manual' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="numbers-mode"
                  checked={numbersMode === 'manual'}
                  onChange={() => setNumbersMode('manual')}
                />
                <span>
                  <strong>Assign numbers now</strong> — squares get their digits immediately, so
                  people can see the numbers while claiming.
                </span>
              </label>
            </div>
          </div>
        ) : (
          <div className="axis-input-group">
            <h4 style={{ margin: 0 }}>Grid Numbers</h4>
            <div className="numbers-mode">
              <label className={numbersMode === 'later' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="numbers-mode"
                  checked={numbersMode === 'later'}
                  onChange={() => setNumbersMode('later')}
                />
                <span>
                  <strong>Draw numbers later</strong> (recommended) — let people claim squares first,
                  then run the randomizer from the board page, choosing how many times it shuffles.
                </span>
              </label>
              <label className={numbersMode === 'manual' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="numbers-mode"
                  checked={numbersMode === 'manual'}
                  onChange={() => setNumbersMode('manual')}
                />
                <span>
                  <strong>Enter numbers now</strong> — type them in (e.g. from a draw you already did)
                  or use the Randomize buttons.
                </span>
              </label>
            </div>

            {numbersMode === 'manual' && (
              <>
                <div className="axis-input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: '#f39c12', margin: 0 }}>X-Axis Numbers (Top Team: {xTeamName || 'Team'})</h4>
                    <button type="button" className="btn btn-secondary" onClick={() => randomizeAxis(setXAxis)}>
                      Randomize
                    </button>
                  </div>
                  <div className="axis-digits">
                    {xAxis.map((digit, idx) => (
                      <input
                        key={`x-${idx}`}
                        type="number"
                        min="0"
                        max="9"
                        value={digit}
                        onChange={(e) => handleXAxisChange(idx, e.target.value)}
                        required
                      />
                    ))}
                  </div>
                </div>

                <div className="axis-input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: '#3498db', margin: 0 }}>Y-Axis Numbers (Left Team: {yTeamName || 'Team'})</h4>
                    <button type="button" className="btn btn-secondary" onClick={() => randomizeAxis(setYAxis)}>
                      Randomize
                    </button>
                  </div>
                  <div className="axis-digits">
                    {yAxis.map((digit, idx) => (
                      <input
                        key={`y-${idx}`}
                        type="number"
                        min="0"
                        max="9"
                        value={digit}
                        onChange={(e) => handleYAxisChange(idx, e.target.value)}
                        required
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="axis-input-group">
          <h4 style={{ margin: 0 }}>How People Get Squares</h4>
          <div className="numbers-mode">
            <label className={claimMode === 'approval' ? 'selected' : ''}>
              <input type="radio" name="claim-mode" checked={claimMode === 'approval'} onChange={() => setClaimMode('approval')} />
              <span><strong>They request, you approve</strong> — anyone with the link (league members) taps a square, you accept or deny with one tap.</span>
            </label>
            <label className={claimMode === 'auto' ? 'selected' : ''}>
              <input type="radio" name="claim-mode" checked={claimMode === 'auto'} onChange={() => setClaimMode('auto')} />
              <span><strong>Auto-accept</strong> — first tap takes the square instantly, no approval step.</span>
            </label>
            <label className={claimMode === 'admin' ? 'selected' : ''}>
              <input type="radio" name="claim-mode" checked={claimMode === 'admin'} onChange={() => setClaimMode('admin')} />
              <span><strong>You assign everything</strong> — squares only change when you edit them.</span>
            </label>
          </div>
        </div>

        <div className="axis-input-group">
          <h4>Money (Optional)</h4>
          <div className="form-row" style={{ marginTop: '10px' }}>
            <div className="form-group">
              <label>Price per Square</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="$0"
                value={squarePrice}
                onChange={(e) => setSquarePrice(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>1st Quarter Prize</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.q1}
                onChange={(e) => setPrizes({ ...prizes, q1: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Halftime Prize</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.half}
                onChange={(e) => setPrizes({ ...prizes, half: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>3rd Quarter Prize</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.q3}
                onChange={(e) => setPrizes({ ...prizes, q3: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Final Prize</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.final}
                onChange={(e) => setPrizes({ ...prizes, final: e.target.value })}
              />
            </div>
            <div className="form-group"></div>
          </div>
        </div>

        {submitError && <div className="track-error">{submitError}</div>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(league ? `/league/${league.id}` : '/')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Board'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateBoard
