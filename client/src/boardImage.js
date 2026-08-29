// Renders a board as a branded PNG the commissioner can post to their
// group (Facebook etc.) — same information as the old spreadsheet
// screenshot, in SquareSZN's look. Pure canvas, no DOM capture.

const COLORS = {
  bg: '#070b14',
  bg2: '#0b1120',
  surface: '#131c2f',
  surfaceDeep: '#0d1424',
  border: 'rgba(148, 163, 184, 0.25)',
  ink: '#f1f5f9',
  ink2: '#94a3b8',
  ink3: '#64748b',
  orange: '#fb923c',
  blue: '#38bdf8',
  green: '#34d399',
  greenDeep: 'rgba(16, 185, 129, 0.25)',
  brand1: '#ff7a18',
  brand2: '#ff2d55'
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const W = 1200

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

function brandGradient(ctx, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, COLORS.brand1)
  grad.addColorStop(1, COLORS.brand2)
  return grad
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1)
  }
  return t + '…'
}

function drawHeader(ctx, board) {
  // Logo mark
  ctx.fillStyle = brandGradient(ctx, 50, 46, 64, 64)
  roundRect(ctx, 50, 46, 64, 64, 18)
  ctx.fill()
  ctx.font = '36px ' + FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText('🏈', 82, 82)

  // Wordmark
  ctx.textAlign = 'left'
  ctx.font = '800 34px ' + FONT
  ctx.fillStyle = COLORS.ink
  ctx.fillText('Square', 132, 70)
  const squareWidth = ctx.measureText('Square').width
  ctx.fillStyle = brandGradient(ctx, 132 + squareWidth, 40, 90, 40)
  ctx.fillText('SZN', 132 + squareWidth, 70)

  ctx.font = '600 20px ' + FONT
  ctx.fillStyle = COLORS.ink3
  ctx.fillText('squareszn.com', 134, 100)

  // Board name + matchup
  ctx.font = '800 44px ' + FONT
  ctx.fillStyle = COLORS.ink
  ctx.fillText(truncate(ctx, board.name || 'Squares Board', W - 100), 50, 168)

  let subline = `${board.xTeamName}  vs  ${board.yTeamName}`
  if (Number(board.squarePrice) > 0) subline += `   ·   $${board.squarePrice}/square`
  ctx.font = '600 24px ' + FONT
  ctx.fillStyle = COLORS.ink2
  ctx.fillText(truncate(ctx, subline, W - 100), 50, 206)

  // Score chip when the game has started
  if (board.gamePhase && board.gamePhase !== 'pre-game' && board.currentScore) {
    const label = `${board.currentScore.xTeam} – ${board.currentScore.yTeam} · ${board.gamePhase}`
    ctx.font = '700 22px ' + FONT
    const w = ctx.measureText(label).width + 40
    ctx.fillStyle = COLORS.surface
    roundRect(ctx, W - 50 - w, 52, w, 46, 23)
    ctx.fill()
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 2
    roundRect(ctx, W - 50 - w, 52, w, 46, 23)
    ctx.stroke()
    ctx.fillStyle = COLORS.ink
    ctx.textAlign = 'center'
    ctx.fillText(label, W - 50 - w / 2, 76)
    ctx.textAlign = 'left'
  }

  return 236 // content start y
}

function drawFooter(ctx, board, y) {
  const prizes = board.prizes || {}
  const chips = [
    ['1st Qtr', prizes.q1],
    ['Half', prizes.half],
    ['3rd Qtr', prizes.q3],
    ['Final', prizes.final]
  ].filter(([, amount]) => Number(amount) > 0)

  let x = 50
  ctx.textBaseline = 'middle'
  for (const [label, amount] of chips) {
    const text = `${label}  $${amount}`
    ctx.font = '700 22px ' + FONT
    const w = ctx.measureText(text).width + 44
    ctx.fillStyle = COLORS.surface
    roundRect(ctx, x, y, w, 48, 24)
    ctx.fill()
    ctx.fillStyle = COLORS.green
    ctx.textAlign = 'left'
    ctx.fillText(text, x + 22, y + 25)
    x += w + 14
  }

  ctx.font = '600 20px ' + FONT
  ctx.fillStyle = COLORS.ink3
  ctx.textAlign = 'right'
  const drawn = boardDigitsReady(board)
  ctx.fillText(drawn ? 'Live scores + winners at squareszn.com' : 'Numbers drawn after all squares are claimed', W - 50, y + 25)
  ctx.textAlign = 'left'
  return y + 78
}

function boardDigitsReady(board) {
  if (board.type === 'strip-10') {
    return (board.squares || []).length > 0 &&
      board.squares.every(sq => (sq.xDigits || []).length > 0 && (sq.yDigits || []).length > 0)
  }
  return (board.xAxis || []).length === 10
}

// ----- strip-10: two columns of five spot cards -----

function drawStrip(ctx, board, top) {
  const gap = 18
  const cardW = (W - 100 - gap) / 2
  const cardH = 184
  const drawn = boardDigitsReady(board)

  board.squares.forEach((square, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 50 + col * (cardW + gap)
    const y = top + row * (cardH + gap)

    ctx.fillStyle = square.owner ? 'rgba(16, 185, 129, 0.12)' : COLORS.surface
    roundRect(ctx, x, y, cardW, cardH, 16)
    ctx.fill()
    ctx.strokeStyle = square.owner ? 'rgba(52, 211, 153, 0.45)' : COLORS.border
    ctx.lineWidth = 2
    roundRect(ctx, x, y, cardW, cardH, 16)
    ctx.stroke()

    // Spot number chip
    ctx.fillStyle = COLORS.surfaceDeep
    roundRect(ctx, x + 18, y + 16, 64, 40, 10)
    ctx.fill()
    ctx.font = '800 24px ' + FONT
    ctx.fillStyle = COLORS.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`#${square.number}`, x + 50, y + 37)

    // Owner
    ctx.textAlign = 'left'
    ctx.font = '700 26px ' + FONT
    ctx.fillStyle = square.owner ? COLORS.ink : COLORS.ink3
    ctx.fillText(truncate(ctx, square.owner || 'Available', cardW - 130), x + 100, y + 37)

    // Digit rows
    const digitRow = (label, values, color, yy) => {
      ctx.fillStyle = color
      ctx.fillRect(x + 18, yy - 14, 5, 30)
      ctx.font = '700 18px ' + FONT
      ctx.fillStyle = COLORS.ink3
      ctx.fillText(label.toUpperCase(), x + 34, yy - 2)
      ctx.font = '800 26px ' + FONT
      ctx.fillStyle = drawn ? COLORS.ink : COLORS.ink3
      ctx.fillText(values, x + 34, yy + 24)
    }
    digitRow(
      truncate(ctx, board.xTeamName, cardW - 60),
      (square.xDigits || []).join(', ') || '?, ?, ?, ?, ?',
      COLORS.orange,
      y + 86
    )
    digitRow(
      truncate(ctx, board.yTeamName, cardW - 60),
      (square.yDigits || []).join(', ') || '?, ?',
      COLORS.blue,
      y + 142
    )
  })

  return top + 5 * (cardH + gap) + 12
}

// ----- grids: the classic table -----

function drawGrid(ctx, board, top) {
  const size = board.type === '5x5' ? 5 : 10
  const axisW = board.type === '5x5' ? 88 : 64
  const cellW = (W - 100 - axisW) / size
  const cellH = board.type === '5x5' ? 96 : 62
  const headerH = 56
  const drawn = boardDigitsReady(board)

  const gridX = 50 + axisW
  const gridY = top + 40

  // Team labels
  ctx.font = '800 26px ' + FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.orange
  ctx.fillText(board.xTeamName.toUpperCase(), gridX + (W - 100 - axisW) / 2, top + 12)

  ctx.save()
  ctx.translate(28, gridY + headerH + (size * cellH) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = COLORS.blue
  ctx.fillText(board.yTeamName.toUpperCase(), 0, 0)
  ctx.restore()

  const axisDigit = (axis, idx) => (drawn && axis && axis[idx] !== undefined ? String(axis[idx]) : '?')

  // Column headers
  for (let c = 0; c < size; c++) {
    const x = gridX + c * cellW
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)'
    roundRect(ctx, x + 2, gridY + 2, cellW - 4, headerH - 4, 8)
    ctx.fill()
    ctx.fillStyle = COLORS.orange
    ctx.font = '800 26px ' + FONT
    const label = board.type === '5x5'
      ? `${axisDigit(board.xAxis, c * 2)} ${axisDigit(board.xAxis, c * 2 + 1)}`
      : axisDigit(board.xAxis, c)
    ctx.fillText(label, x + cellW / 2, gridY + headerH / 2)
  }

  const squareAt = {}
  for (const sq of board.squares || []) {
    if (sq.row != null && sq.col != null) squareAt[`${sq.row}-${sq.col}`] = sq
  }

  for (let r = 0; r < size; r++) {
    const y = gridY + headerH + r * cellH
    // Row header
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)'
    roundRect(ctx, 52 + (axisW - 50) / 2 - 4, y + 2, 54, cellH - 4, 8)
    ctx.fill()
    ctx.fillStyle = COLORS.blue
    ctx.font = '800 26px ' + FONT
    const rowLabel = board.type === '5x5'
      ? `${axisDigit(board.yAxis, r * 2)} ${axisDigit(board.yAxis, r * 2 + 1)}`
      : axisDigit(board.yAxis, r)
    ctx.fillText(rowLabel, 52 + (axisW - 50) / 2 + 23, y + cellH / 2)

    for (let c = 0; c < size; c++) {
      const x = gridX + c * cellW
      const square = squareAt[`${r}-${c}`]
      const claimed = !!square?.owner
      ctx.fillStyle = claimed ? 'rgba(16, 185, 129, 0.16)' : 'rgba(56, 88, 128, 0.22)'
      roundRect(ctx, x + 2, y + 2, cellW - 4, cellH - 4, 8)
      ctx.fill()
      if (claimed) {
        ctx.fillStyle = COLORS.ink
        ctx.font = `600 ${board.type === '5x5' ? 24 : 17}px ` + FONT
        ctx.fillText(truncate(ctx, square.owner, cellW - 14), x + cellW / 2, y + cellH / 2)
      }
    }
  }

  ctx.textAlign = 'left'
  return gridY + headerH + size * cellH + 24
}

export function renderBoardImage(board) {
  const isStrip = board.type === 'strip-10'
  const gridSize = board.type === '5x5' ? 5 : 10
  const bodyH = isStrip
    ? 5 * 202 + 12
    : 40 + 56 + gridSize * (board.type === '5x5' ? 96 : 62) + 24
  const H = 236 + bodyH + 96

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  // Ground
  const bgGrad = ctx.createLinearGradient(0, 0, W, H)
  bgGrad.addColorStop(0, COLORS.bg)
  bgGrad.addColorStop(1, COLORS.bg2)
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, 700)
  glow.addColorStop(0, 'rgba(255, 122, 24, 0.14)')
  glow.addColorStop(1, 'rgba(255, 122, 24, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const contentTop = drawHeader(ctx, board)
  const bodyEnd = isStrip ? drawStrip(ctx, board, contentTop) : drawGrid(ctx, board, contentTop)
  drawFooter(ctx, board, bodyEnd)

  return canvas
}
