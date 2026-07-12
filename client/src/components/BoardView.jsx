import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'

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

// shareMode: reached via /share/:token — read-only, uses share endpoints
function BoardView({ shareMode = false }) {
  const { id, token } = useParams()
  const { user } = useAuth()
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
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
  const [leagueMembers, setLeagueMembers] = useState([])
  const [copied, setCopied] = useState(false)

  // Live NFL game sync
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [liveGames, setLiveGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gamesError, setGamesError] = useState(null)
  const [linkDate, setLinkDate] = useState('')
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [selectedSide, setSelectedSide] = useState('home')
  const [linking, setLinking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [liveError, setLiveError] = useState(null)

  // Number drawing
  const [showDrawModal, setShowDrawModal] = useState(false)
  const [drawRuns, setDrawRuns] = useState('3')
  const [drawMode, setDrawMode] = useState('randomize') // 'randomize' | 'manual'
  const [manualX, setManualX] = useState(Array(10).fill(''))
  const [manualY, setManualY] = useState(Array(10).fill(''))
  const [drawing, setDrawing] = useState(false)
  const [drawError, setDrawError] = useState(null)
  const [drawPreview, setDrawPreview] = useState(null) // { runNumber, xAxis, yAxis, final }

  // Refs so timers and async callbacks always see current values
  const boardRef = useRef(null)
  const mySquaresRef = useRef([])
  useEffect(() => { boardRef.current = board }, [board])
  useEffect(() => { mySquaresRef.current = mySquareNumbers }, [mySquareNumbers])

  const boardApi = shareMode ? `/api/share/${token}` : `/api/boards/${id}`
  const canEdit = !shareMode && !!board?.canEdit
  const storageKey = board ? `fst-my-squares-${board.id}` : null

  useTitle(board ? (shareMode ? `Watch live: ${board.name}` : board.name) : null)

  useEffect(() => {
    // Reset everything when navigating between boards
    setLoading(true)
    setLoadError(null)
    setBoard(null)
    setMySquares('')
    setMySquareNumbers([])
    setWinningCombinations([])
    setCurrentWinners([])
    setTrackError(null)
    setLeagueMembers([])
    fetchBoard()
  }, [id, token])

  useEffect(() => {
    if (board) {
      setScoreX(String(board.currentScore?.xTeam ?? 0))
      setScoreY(String(board.currentScore?.yTeam ?? 0))
      setGamePhase(board.gamePhase || 'pre-game')
    }
  }, [board])

  const restoreTracking = async (loadedBoard) => {
    // Prefer squares saved to the account, fall back to this device
    let saved = null
    if (user) {
      const { ok, data } = await apiFetch('/api/me/tracked')
      if (ok) {
        const entry = (data.trackedGames || []).find(t => t.boardId === loadedBoard.id)
        if (entry) saved = entry.squares.join(', ')
      }
    }
    if (!saved) {
      saved = localStorage.getItem(`fst-my-squares-${loadedBoard.id}`)
    }
    if (saved) {
      setMySquares(saved)
      trackSquares(saved, loadedBoard)
    }
  }

  const fetchBoard = async () => {
    try {
      const { ok, status, data } = await apiFetch(boardApi)
      if (!ok) {
        setBoard(null)
        setLoadError(status === 403
          ? (data.error || 'This board is private.')
          : (data.error || 'Board not found'))
        return
      }
      setBoard(data)
      restoreTracking(data)

      // Owners of league boards get roster autocomplete
      if (data.leagueId && data.canEdit && !shareMode) {
        const league = await apiFetch(`/api/leagues/${data.leagueId}`)
        if (league.ok) setLeagueMembers(league.data.members || [])
      }

      // Linked boards should show the real score immediately
      if (data.liveGame && data.liveGame.lastSync?.state !== 'post') {
        syncLiveScore(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const trackSquares = async (input, boardOverride = null) => {
    const activeBoard = boardOverride || boardRef.current || board
    if (!activeBoard) return

    const squareNums = parseSquareNumbers(input)
    setMySquareNumbers(squareNums)
    setTrackError(null)

    const key = `fst-my-squares-${activeBoard.id}`

    if (squareNums.length === 0) {
      setWinningCombinations([])
      setCurrentWinners([])
      localStorage.removeItem(key)
      if (user && !shareMode) {
        apiFetch('/api/me/tracked', { method: 'PUT', body: JSON.stringify({ boardId: activeBoard.id, squares: [] }) })
      }
      if (input.trim()) {
        setTrackError('Enter square numbers separated by commas, e.g. 1, 5, 12')
      }
      return
    }

    localStorage.setItem(key, squareNums.join(', '))
    if (user) {
      apiFetch('/api/me/tracked', { method: 'PUT', body: JSON.stringify({ boardId: activeBoard.id, squares: squareNums }) })
    }

    const url = shareMode
      ? `/api/share/${token}/my-squares?squares=${squareNums.join(',')}`
      : `/api/boards/${id}/my-squares?squares=${squareNums.join(',')}`
    const { ok, data } = await apiFetch(url)
    if (!ok) {
      setTrackError(data.error || 'Failed to look up your squares')
      return
    }
    setWinningCombinations(data.winningCombinations || [])
    setCurrentWinners(data.currentWinners || [])
  }

  // ----- Live NFL score sync -----

  const syncLiveScore = async (manual = false) => {
    setSyncing(true)
    try {
      const url = shareMode ? `/api/share/${token}/sync-live` : `/api/boards/${id}/sync-live`
      const { ok, data } = await apiFetch(url, { method: 'POST' })
      if (!ok) {
        if (manual) setLiveError(data.error || 'Failed to sync live score')
        return
      }
      setLiveError(null)
      const prev = boardRef.current
      const scoreChanged =
        prev?.currentScore?.xTeam !== data.board.currentScore.xTeam ||
        prev?.currentScore?.yTeam !== data.board.currentScore.yTeam
      setBoard(data.board)
      if (scoreChanged && mySquaresRef.current.length > 0) {
        trackSquares(mySquaresRef.current.join(','), data.board)
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!board?.liveGame) return
    const state = board.liveGame.lastSync?.state
    if (state === 'post') return
    const delay = state === 'in' ? 30000 : 120000
    const timer = setTimeout(() => syncLiveScore(false), delay)
    return () => clearTimeout(timer)
  }, [board])

  const matchesTeam = (team, name) => {
    const wanted = (name || '').trim().toLowerCase()
    if (!wanted) return false
    const full = (team.name || '').toLowerCase()
    const abbr = (team.abbreviation || '').toLowerCase()
    return full.includes(wanted) || wanted === abbr ||
      wanted.split(/\s+/).some(word => word.length > 2 && full.includes(word))
  }

  const guessSide = (game) => {
    if (matchesTeam(game.home, board?.xTeamName)) return 'home'
    if (matchesTeam(game.away, board?.xTeamName)) return 'away'
    if (matchesTeam(game.home, board?.yTeamName)) return 'away'
    if (matchesTeam(game.away, board?.yTeamName)) return 'home'
    return 'home'
  }

  const loadGames = async (dateValue) => {
    setGamesLoading(true)
    setGamesError(null)
    const dates = (dateValue || '').replaceAll('-', '')
    const { ok, data } = await apiFetch(`/api/nfl/scoreboard${dates ? `?dates=${dates}` : ''}`)
    if (!ok) {
      setLiveGames([])
      setGamesError(data.error || 'Failed to load NFL games')
    } else {
      setLiveGames(data.games || [])
      if ((data.games || []).length === 0) {
        setGamesError('No NFL games found for this date — try another date.')
      }
    }
    setGamesLoading(false)
  }

  const openLinkModal = () => {
    setShowLinkModal(true)
    setSelectedGameId(null)
    setLinkDate('')
    loadGames('')
  }

  const selectGame = (game) => {
    setSelectedGameId(game.id)
    setSelectedSide(guessSide(game))
  }

  const linkGame = async () => {
    const game = liveGames.find(g => g.id === selectedGameId)
    if (!game) return
    setLinking(true)
    try {
      const { ok, data } = await apiFetch(`/api/boards/${id}/live-game`, {
        method: 'PUT',
        body: JSON.stringify({ eventId: game.id, xTeamSide: selectedSide })
      })
      if (!ok) {
        setGamesError(data.error || 'Failed to link game')
        return
      }
      setBoard(data)
      setShowLinkModal(false)
      setLiveError(null)
      if (mySquaresRef.current.length > 0) {
        trackSquares(mySquaresRef.current.join(','), data)
      }
    } finally {
      setLinking(false)
    }
  }

  const unlinkGame = async () => {
    if (!confirm('Unlink this board from the live game? The score stays but stops updating.')) return
    const { ok, data } = await apiFetch(`/api/boards/${id}/live-game`, {
      method: 'PUT',
      body: JSON.stringify({ clear: true })
    })
    if (ok) setBoard(data)
  }

  // ----- Number drawing -----

  const randomizeManualAxis = (setter) => {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]]
    }
    setter(digits.map(String))
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const runDraw = async () => {
    setDrawError(null)
    setDrawing(true)
    try {
      let body
      if (drawMode === 'manual') {
        body = { mode: 'manual', xAxis: manualX.map(Number), yAxis: manualY.map(Number) }
      } else {
        body = { runs: parseInt(drawRuns, 10) || 1 }
      }

      const { ok, data } = await apiFetch(`/api/boards/${id}/draw-axes`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })
      if (!ok) {
        setDrawError(data.error || 'Failed to draw numbers')
        return
      }

      // Animate through each randomization run so the group can see the
      // draw "spin" before it lands on the final numbers
      const history = data.drawLog?.history || []
      if (history.length > 0) {
        for (let i = 0; i < history.length; i++) {
          setDrawPreview({ runNumber: i + 1, total: history.length, ...history[i], final: i === history.length - 1 })
          await sleep(i === history.length - 1 ? 900 : 550)
        }
      }

      setBoard(data)
      setShowDrawModal(false)
      setDrawPreview(null)
      if (mySquaresRef.current.length > 0) {
        trackSquares(mySquaresRef.current.join(','), data)
      }
    } finally {
      setDrawing(false)
    }
  }

  // ----- Payments -----

  const paymentRows = useMemo(() => {
    if (!board) return []
    const byName = new Map()
    for (const square of board.squares || []) {
      const owner = (square.owner || '').trim()
      if (!owner) continue
      const key = owner.toLowerCase()
      if (!byName.has(key)) byName.set(key, { name: owner, count: 0 })
      byName.get(key).count++
    }
    const price = Number(board.squarePrice) || 0
    return [...byName.entries()]
      .map(([key, row]) => ({
        key,
        name: row.name,
        count: row.count,
        owed: row.count * price,
        paid: !!board.payments?.[key]?.paid
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [board])

  const togglePaid = async (row) => {
    const { ok, data } = await apiFetch(`/api/boards/${id}/payments`, {
      method: 'PUT',
      body: JSON.stringify({ name: row.name, paid: !row.paid })
    })
    if (ok) setBoard(data)
  }

  // ----- Owner tools -----

  const shareUrl = board?.shareToken ? `${window.location.origin}/share/${board.shareToken}` : null

  const copyShareLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      prompt('Copy this link:', shareUrl)
    }
  }

  const updateScore = async () => {
    const x = parseInt(scoreX, 10)
    const y = parseInt(scoreY, 10)
    const { ok, data } = await apiFetch(`/api/boards/${id}/score`, {
      method: 'PUT',
      body: JSON.stringify({ xTeam: isNaN(x) ? 0 : x, yTeam: isNaN(y) ? 0 : y, gamePhase })
    })
    if (!ok) return
    setBoard(data)
    if (mySquareNumbers.length > 0) {
      trackSquares(mySquareNumbers.join(','), data)
    }
  }

  const bumpScore = (setter, current, delta) => {
    const value = parseInt(current, 10) || 0
    setter(String(Math.max(0, value + delta)))
  }

  const openSquareEditor = (square) => {
    if (!canEdit) return
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

    const { ok, data } = await apiFetch(`/api/boards/${id}/squares/${editingSquare}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
    if (!ok) {
      setEditError(data.error || 'Failed to save square')
      return
    }
    setBoard(data)
    closeSquareEditor()
    if (mySquareNumbers.length > 0) {
      trackSquares(mySquareNumbers.join(','), data)
    }
  }

  const recordPeriodResult = async (period) => {
    const existing = board.periodResults?.[period.key]
    if (existing && !confirm(`Overwrite the recorded ${period.label} result?`)) return

    setRecordingPeriod(period.key)
    try {
      const { ok, data } = await apiFetch(`/api/boards/${id}/period-result`, {
        method: 'PUT',
        body: JSON.stringify({ period: period.key })
      })
      if (!ok) {
        alert(data.error || 'Failed to record result')
        return
      }
      setBoard(data)
    } finally {
      setRecordingPeriod(null)
    }
  }

  // All squares winning at the current score
  const winningSquares = useMemo(() => {
    if (!board || !board.currentScore) return []
    if (board.gamePhase === 'pre-game') return []
    if (board.type !== 'strip-10' && (board.xAxis || []).length !== 10) return []

    const xLastDigit = board.currentScore.xTeam % 10
    const yLastDigit = board.currentScore.yTeam % 10

    const winners = []
    for (const square of board.squares) {
      let xDigits, yDigits

      if (board.type === 'strip-10') {
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
        <h2>Board Not Available</h2>
        <p>{loadError || "The board you're looking for doesn't exist."}</p>
        <Link to="/boards" className="btn btn-primary">Back to Boards</Link>
      </div>
    )
  }

  const gridSize = board.type === '5x5' ? 5 : 10
  const isPreGame = board.gamePhase === 'pre-game'
  const axesDrawn = board.type === 'strip-10' || (board.xAxis || []).length === 10
  const memberNames = leagueMembers.map(m => m.name)

  const winnerLabel = (num) => {
    const sq = board.squares.find(s => s.number === num)
    return `#${num}${sq?.owner ? ` (${sq.owner})` : ''}`
  }

  const renderStripGrid = () => {
    return (
      <div className="strip-grid">
        {board.squares.map((square) => {
          const isHighlighted = mySquareNumbers.includes(square.number)
          const isWinning = winningSquares.includes(square.number)

          return (
            <div
              key={`square-${square.number}`}
              className={`strip-square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''} ${canEdit ? '' : 'no-edit'}`}
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
    const digitOrQ = (value) => value === undefined || value === null ? '?' : value

    const headerRow = [
      <div key="corner" className="grid-header corner"></div>
    ]

    for (let col = 0; col < gridSize; col++) {
      if (board.type === '5x5') {
        headerRow.push(
          <div key={`header-${col}`} className="grid-header x-header">
            <span className="digit">{digitOrQ(board.xAxis[col * 2])}</span>
            <span className="digit">{digitOrQ(board.xAxis[col * 2 + 1])}</span>
          </div>
        )
      } else {
        headerRow.push(
          <div key={`header-${col}`} className="grid-header x-header">
            <span className="digit">{digitOrQ(board.xAxis[col])}</span>
          </div>
        )
      }
    }
    rows.push(headerRow)

    for (let row = 0; row < gridSize; row++) {
      const rowCells = []

      if (board.type === '5x5') {
        rowCells.push(
          <div key={`y-header-${row}`} className="grid-header y-header">
            <span className="digit">{digitOrQ(board.yAxis[row * 2])}</span>
            <span className="digit">{digitOrQ(board.yAxis[row * 2 + 1])}</span>
          </div>
        )
      } else {
        rowCells.push(
          <div key={`y-header-${row}`} className="grid-header y-header">
            <span className="digit">{digitOrQ(board.yAxis[row])}</span>
          </div>
        )
      }

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
            className={`square ${isHighlighted ? 'highlighted' : ''} ${isWinning ? 'winning' : ''} ${canEdit ? '' : 'no-edit'}`}
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

  const drawLogLine = board.drawLog && axesDrawn && board.type !== 'strip-10' ? (
    board.drawLog.mode === 'randomized'
      ? `Numbers drawn on-site with ${board.drawLog.runs} randomization${board.drawLog.runs === 1 ? '' : 's'} · ${new Date(board.drawLog.drawnAt).toLocaleString()}`
      : null
  ) : null

  return (
    <div>
      {shareMode && (
        <div className="viewer-banner">
          👀 You're watching this board live (view-only).
          {!user && (
            <span> Playing in this game? <Link to="/register">Create a free account</Link> to track your squares and stats.</span>
          )}
        </div>
      )}

      {!shareMode && (
        <div style={{ marginBottom: '20px' }}>
          <Link to={board.leagueId && canEdit ? `/league/${board.leagueId}` : '/boards'} className="btn btn-secondary">
            ← {board.leagueId && canEdit ? board.leagueName || 'League' : 'Back to Boards'}
          </Link>
        </div>
      )}

      <div className="board-title-row">
        <h2 style={{ fontSize: '1.8rem' }}>{board.name}</h2>
        {canEdit && shareUrl && (
          <button className="btn btn-secondary btn-small" onClick={copyShareLink}>
            {copied ? '✓ Copied!' : '🔗 Copy Share Link'}
          </button>
        )}
      </div>
      {board.leagueName && <p className="board-league-tag">{board.leagueName}</p>}

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
        {board.liveGame && (
          <div className={`live-indicator ${board.liveGame.lastSync?.state || 'pre'}`}>
            {board.liveGame.lastSync?.state === 'in' ? '● LIVE' :
              board.liveGame.lastSync?.state === 'post' ? '🏁 FINAL' : '⏱ SCHEDULED'}
            {board.liveGame.lastSync?.detail ? ` — ${board.liveGame.lastSync.detail}` : ''}
            {syncing ? ' (syncing…)' : ''}
          </div>
        )}
        {winningSquares.length > 0 && (
          <div className="winning-banner">
            {winningSquares.length === 1 ? 'Current Winning Square: ' : 'Current Winning Squares: '}
            {winningSquares.map(winnerLabel).join(', ')}
          </div>
        )}
      </div>

      {!axesDrawn && (
        <div className="draw-banner">
          <span>
            🎲 Numbers haven't been drawn yet — squares get claimed first, then the columns and rows are randomized.
          </span>
          {canEdit && isPreGame && (
            <button className="btn btn-primary btn-small" onClick={() => { setShowDrawModal(true); setDrawError(null) }}>
              Draw Numbers
            </button>
          )}
        </div>
      )}

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
            {drawLogLine && <p className="draw-provenance">🎲 {drawLogLine}</p>}
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
            {user && (
              <p className="live-hint" style={{ marginTop: '-5px' }}>Saved to your account for your stats page.</p>
            )}

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
            {!axesDrawn && mySquareNumbers.length > 0 && (
              <p className="live-hint">Winning combos appear once the numbers are drawn.</p>
            )}
          </div>

          {/* Live NFL Score Sync */}
          <div className="card">
            <h3>Live Score Sync</h3>
            {board.liveGame ? (
              <>
                <div className="live-status">
                  <span className={`live-badge ${board.liveGame.lastSync?.state || 'pre'}`}>
                    {board.liveGame.lastSync?.state === 'in' ? '● LIVE' :
                      board.liveGame.lastSync?.state === 'post' ? 'FINAL' : 'SCHEDULED'}
                  </span>
                  <span className="live-game-name">{board.liveGame.gameName}</span>
                </div>
                <p className="live-detail">
                  {board.liveGame.lastSync?.detail || 'Waiting for first sync'}
                  {board.liveGame.lastSync?.state === 'in' && ' — auto-updating every 30s'}
                </p>
                {liveError && <div className="track-error">{liveError}</div>}
                <div className="live-actions">
                  <button className="btn btn-secondary" onClick={() => syncLiveScore(true)} disabled={syncing}>
                    {syncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  {canEdit && (
                    <button className="btn btn-secondary" onClick={unlinkGame}>Unlink</button>
                  )}
                </div>
              </>
            ) : canEdit ? (
              <>
                <p className="live-hint">
                  Link this board to a real NFL game and the score and quarter update automatically from ESPN.
                </p>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={openLinkModal}>
                  Link NFL Game
                </button>
              </>
            ) : (
              <p className="live-hint">Not linked to a live game.</p>
            )}
          </div>

          {/* Score Controls (owner only) */}
          {canEdit && (
            <div className="card">
              <h3>Update Score</h3>
              {board.liveGame && (
                <p className="live-hint" style={{ marginBottom: '10px' }}>
                  This board is linked to a live game — manual changes will be overwritten on the next sync.
                </p>
              )}
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
          )}

          {/* Payments (owner only) */}
          {canEdit && paymentRows.length > 0 && (
            <div className="card">
              <h3>Payments</h3>
              {Number(board.squarePrice) > 0 && (
                <p className="live-hint">${board.squarePrice} per square</p>
              )}
              <div className="payment-list">
                {paymentRows.map(row => (
                  <label key={row.key} className={`payment-row ${row.paid ? 'paid' : ''}`}>
                    <input
                      type="checkbox"
                      checked={row.paid}
                      onChange={() => togglePaid(row)}
                    />
                    <span className="payment-name">
                      {row.name}
                      <span className="payment-count"> · {row.count} sq</span>
                    </span>
                    {Number(board.squarePrice) > 0 && (
                      <span className="payment-owed">${row.owed}</span>
                    )}
                  </label>
                ))}
              </div>
              {Number(board.squarePrice) > 0 && (
                <div className="payment-totals">
                  <span>Collected: ${paymentRows.filter(r => r.paid).reduce((s, r) => s + r.owed, 0)}</span>
                  <span className="outstanding">Outstanding: ${paymentRows.filter(r => !r.paid).reduce((s, r) => s + r.owed, 0)}</span>
                </div>
              )}
            </div>
          )}

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
                      {canEdit && (
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
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Draw Numbers Modal */}
      {showDrawModal && (
        <div className="modal-overlay" onClick={() => !drawing && setShowDrawModal(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Draw the Numbers</h3>

            {drawPreview ? (
              <div className="draw-animation">
                <p className="draw-run-label">
                  {drawPreview.final ? '🔒 Final draw!' : `Randomization ${drawPreview.runNumber} of ${drawPreview.total}…`}
                </p>
                <div className={`draw-axes ${drawPreview.final ? 'final' : ''}`}>
                  <div className="draw-axis-row">
                    <span className="draw-axis-label x">{board.xTeamName}</span>
                    {drawPreview.xAxis.map((d, i) => <span key={i} className="digit">{d}</span>)}
                  </div>
                  <div className="draw-axis-row">
                    <span className="draw-axis-label y">{board.yTeamName}</span>
                    {drawPreview.yAxis.map((d, i) => <span key={i} className="digit">{d}</span>)}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="numbers-mode">
                  <label className={drawMode === 'randomize' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="draw-mode"
                      checked={drawMode === 'randomize'}
                      onChange={() => setDrawMode('randomize')}
                    />
                    <span><strong>Randomize on site</strong> — pick how many times to shuffle; every run is saved so the group can see the draw was fair.</span>
                  </label>
                  <label className={drawMode === 'manual' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="draw-mode"
                      checked={drawMode === 'manual'}
                      onChange={() => setDrawMode('manual')}
                    />
                    <span><strong>Enter manually</strong> — you already drew numbers elsewhere (e.g. a wheel or generator).</span>
                  </label>
                </div>

                {drawMode === 'randomize' ? (
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>How many randomizations? (final one counts)</label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={drawRuns}
                      onChange={(e) => setDrawRuns(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="axis-input-group" style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ color: '#f39c12' }}>{board.xTeamName} (top)</label>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => randomizeManualAxis(setManualX)}>Randomize</button>
                      </div>
                      <div className="axis-digits">
                        {manualX.map((digit, idx) => (
                          <input
                            key={`mx-${idx}`}
                            type="number"
                            min="0"
                            max="9"
                            value={digit}
                            onChange={(e) => {
                              const next = [...manualX]; next[idx] = e.target.value; setManualX(next)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="axis-input-group" style={{ marginTop: '10px', marginBottom: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ color: '#3498db' }}>{board.yTeamName} (left)</label>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => randomizeManualAxis(setManualY)}>Randomize</button>
                      </div>
                      <div className="axis-digits">
                        {manualY.map((digit, idx) => (
                          <input
                            key={`my-${idx}`}
                            type="number"
                            min="0"
                            max="9"
                            value={digit}
                            onChange={(e) => {
                              const next = [...manualY]; next[idx] = e.target.value; setManualY(next)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {drawError && <div className="track-error">{drawError}</div>}

                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowDrawModal(false)} disabled={drawing}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={runDraw} disabled={drawing}>
                    {drawing ? 'Drawing…' : (drawMode === 'randomize' ? '🎲 Run the Draw' : 'Save Numbers')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Link Live Game Modal */}
      {showLinkModal && (() => {
        const selectedGame = liveGames.find(g => g.id === selectedGameId)
        return (
          <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
            <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
              <h3>Link a Live NFL Game</h3>
              <div className="game-date-row">
                <input
                  type="date"
                  value={linkDate}
                  onChange={(e) => { setLinkDate(e.target.value); loadGames(e.target.value) }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => { setLinkDate(''); loadGames('') }}
                >
                  This Week
                </button>
              </div>

              {gamesLoading ? (
                <div className="loading" style={{ minHeight: '100px' }}>
                  <div className="spinner"></div>
                </div>
              ) : (
                <div className="game-list">
                  {liveGames.map(game => (
                    <label key={game.id} className={`game-row ${selectedGameId === game.id ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="live-game"
                        checked={selectedGameId === game.id}
                        onChange={() => selectGame(game)}
                      />
                      <span className="game-name">{game.name}</span>
                      <span className="game-state">
                        {game.state === 'in' ? game.detail :
                          game.state === 'post' ? `Final ${game.away.score}-${game.home.score}` :
                          game.date ? new Date(game.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {gamesError && <div className="track-error">{gamesError}</div>}

              {selectedGame && (
                <div className="side-picker">
                  <p>Which team is <strong>{board.xTeamName}</strong> (the top axis)?</p>
                  <label>
                    <input
                      type="radio"
                      name="x-side"
                      checked={selectedSide === 'home'}
                      onChange={() => setSelectedSide('home')}
                    />
                    {selectedGame.home.name} <span className="side-tag">home</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="x-side"
                      checked={selectedSide === 'away'}
                      onChange={() => setSelectedSide('away')}
                    />
                    {selectedGame.away.name} <span className="side-tag">away</span>
                  </label>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowLinkModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={linkGame} disabled={!selectedGameId || linking}>
                  {linking ? 'Linking…' : 'Link Game'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
              list={memberNames.length > 0 ? 'league-members' : undefined}
              autoFocus
            />
            {memberNames.length > 0 && (
              <datalist id="league-members">
                {memberNames.map(name => <option key={name} value={name} />)}
              </datalist>
            )}
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
