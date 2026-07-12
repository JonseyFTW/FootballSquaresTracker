import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ImageImport from './ImageImport'

function CreateBoard() {
  const navigate = useNavigate()
  const [boardType, setBoardType] = useState('5x5')
  const [name, setName] = useState('')
  const [xTeamName, setXTeamName] = useState('')
  const [yTeamName, setYTeamName] = useState('')
  const [xAxis, setXAxis] = useState(Array(10).fill(''))
  const [yAxis, setYAxis] = useState(Array(10).fill(''))
  const [prizes, setPrizes] = useState({
    q1: '',
    half: '',
    q3: '',
    final: ''
  })
  const [loading, setLoading] = useState(false)
  const [importedSquares, setImportedSquares] = useState(null)
  const [importedType, setImportedType] = useState(null)
  const [importWarnings, setImportWarnings] = useState([])
  const [importNotice, setImportNotice] = useState(null)
  const [showImport, setShowImport] = useState(true)

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
    // Populate form with imported data
    setBoardType(data.type)
    setImportedType(data.type)
    setXTeamName(data.xTeamName)
    setYTeamName(data.yTeamName)
    setImportWarnings(data.warnings || [])
    setImportNotice(null)

    // Strip-10 may not have axis arrays
    if (data.type === 'strip-10') {
      setXAxis(Array(10).fill(''))
      setYAxis(Array(10).fill(''))
    } else {
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

    // Generate a default name
    if (!name) {
      setName(`${data.xTeamName} vs ${data.yTeamName} Squares`)
    }
  }

  // Imported squares only make sense for the board type they came from —
  // switching types would otherwise send stale squares to the server.
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

    // Validate
    if (!name || !xTeamName || !yTeamName) {
      alert('Please fill in all required fields')
      return
    }

    const xAxisNums = xAxis.map(Number)
    const yAxisNums = yAxis.map(Number)

    // Validate axis contains all digits 0-9 (only for grid types)
    if (boardType !== 'strip-10') {
      const validAxis = (axis) => {
        const sorted = [...axis].sort((a, b) => a - b)
        return sorted.every((val, idx) => val === idx)
      }

      if (!validAxis(xAxisNums) || !validAxis(yAxisNums)) {
        alert('Each axis must contain exactly the digits 0-9 (each digit once)')
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
        xAxis: xAxisNums,
        yAxis: yAxisNums,
        prizes: {
          q1: prizes.q1 ? parseFloat(prizes.q1) : 0,
          half: prizes.half ? parseFloat(prizes.half) : 0,
          q3: prizes.q3 ? parseFloat(prizes.q3) : 0,
          final: prizes.final ? parseFloat(prizes.final) : 0
        }
      }

      // Include imported squares in the creation request (avoids race condition)
      if (importedSquares && importedSquares.length > 0) {
        boardPayload.squares = importedSquares
      }

      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boardPayload)
      })

      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        navigate(`/board/${data.id}`)
      } else {
        alert(data.error || 'Error creating board')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error creating board')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h3>Create New Board</h3>

      {/* Image Import Section */}
      {showImport ? (
        <div className="import-section">
          <ImageImport onImportComplete={handleImportComplete} />
          <div className="import-divider">
            <span>or enter details manually</span>
          </div>
        </div>
      ) : (
        <div className="import-summary">
          <div className="import-success">
            <span>
              Imported a {importedType === 'strip-10' ? '10-strip' : importedType} board — {xTeamName} vs {yTeamName},{' '}
              {filledSquareCount} of {importedSquares?.length || 0} squares have owners.
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setShowImport(true)}
            >
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
      )}

      {importNotice && (
        <div className="import-notice">{importNotice}</div>
      )}

      <form className="create-board-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Board Name</label>
          <input
            type="text"
            placeholder="e.g., Super Bowl LVIII Squares"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Board Type</label>
          <select value={boardType} onChange={(e) => handleBoardTypeChange(e.target.value)}>
            <option value="5x5">5x5 Grid (25 squares, 2 digits per cell)</option>
            <option value="10x10">10x10 Grid (100 squares, 1 digit per cell)</option>
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
            <h4 style={{ color: '#8892b0', margin: 0 }}>10-Strip Configuration</h4>
            <p style={{ color: '#8892b0', fontSize: '0.9rem', marginTop: '10px' }}>
              Each of the 10 squares will be randomly assigned 5 numbers from {xTeamName || 'X-Team'} and 2 numbers from {yTeamName || 'Y-Team'}.
              This gives each square 10 possible winning score combinations (5 x 2).
            </p>
            <p style={{ color: '#64ffda', fontSize: '0.85rem', marginTop: '5px' }}>
              Numbers are distributed so every possible score has exactly one winner: each digit (0-9) appears in exactly 5 squares
              for the primary team and 2 squares for the secondary team. You can edit any square's digits later from the board view.
            </p>
          </div>
        ) : (
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

        <div className="axis-input-group">
          <h4>Prize Amounts (Optional)</h4>
          <div className="form-row" style={{ marginTop: '10px' }}>
            <div className="form-group">
              <label>1st Quarter</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.q1}
                onChange={(e) => setPrizes({ ...prizes, q1: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Halftime</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.half}
                onChange={(e) => setPrizes({ ...prizes, half: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>3rd Quarter</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.q3}
                onChange={(e) => setPrizes({ ...prizes, q3: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Final</label>
              <input
                type="number"
                placeholder="$0"
                value={prizes.final}
                onChange={(e) => setPrizes({ ...prizes, final: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
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
