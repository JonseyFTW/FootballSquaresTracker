import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate
    if (!name || !xTeamName || !yTeamName) {
      alert('Please fill in all required fields')
      return
    }

    const xAxisNums = xAxis.map(Number)
    const yAxisNums = yAxis.map(Number)

    // Validate axis contains all digits 0-9
    const validAxis = (axis) => {
      const sorted = [...axis].sort((a, b) => a - b)
      return sorted.every((val, idx) => val === idx)
    }

    if (!validAxis(xAxisNums) || !validAxis(yAxisNums)) {
      alert('Each axis must contain exactly the digits 0-9 (each digit once)')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      })

      if (response.ok) {
        const board = await response.json()
        navigate(`/board/${board.id}`)
      } else {
        alert('Error creating board')
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
          <select value={boardType} onChange={(e) => setBoardType(e.target.value)}>
            <option value="5x5">5x5 Grid (25 squares, 2 digits per cell)</option>
            <option value="10x10">10x10 Grid (100 squares, 1 digit per cell)</option>
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
