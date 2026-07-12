// Player analytics computed from tracked games + recorded period results.
// Pure functions — no storage access — so they're easy to test.

const PERIOD_LABELS = {
  q1: '1st Quarter',
  half: 'Halftime',
  q3: '3rd Quarter',
  final: 'Final'
};

// trackedGames: [{ boardId, squares: [numbers], updatedAt }]
// boardsById:   { [boardId]: board | undefined }
function computeAnalytics(trackedGames, boardsById) {
  const games = [];
  const wins = [];
  let squaresTracked = 0;
  let periodsPlayed = 0;
  let totalWinnings = 0;

  for (const tracked of trackedGames || []) {
    const board = boardsById[tracked.boardId];
    if (!board) continue; // board deleted — nothing to report

    const squares = [...new Set((tracked.squares || []).map(Number).filter(n => !isNaN(n) && n > 0))];
    if (squares.length === 0) continue;
    const squareSet = new Set(squares);
    squaresTracked += squares.length;

    const periods = [];
    for (const [periodKey, result] of Object.entries(board.periodResults || {})) {
      if (!result || !PERIOD_LABELS[periodKey]) continue;
      periodsPlayed++;

      const winningSquares = (result.winners || []).filter(w => squareSet.has(w.squareNumber));
      const won = winningSquares.length > 0;
      const amount = won ? (Number(board.prizes?.[periodKey]) || 0) : 0;

      const entry = {
        period: periodKey,
        periodLabel: PERIOD_LABELS[periodKey],
        won,
        amount,
        score: result.score || null,
        recordedAt: result.recordedAt || null,
        winningSquares: winningSquares.map(w => w.squareNumber)
      };
      periods.push(entry);

      if (won) {
        totalWinnings += amount;
        wins.push({
          boardId: board.id,
          boardName: board.name,
          teams: `${board.xTeamName} vs ${board.yTeamName}`,
          ...entry
        });
      }
    }

    games.push({
      boardId: board.id,
      boardName: board.name,
      teams: `${board.xTeamName} vs ${board.yTeamName}`,
      gamePhase: board.gamePhase || 'pre-game',
      squares,
      squareCount: squares.length,
      squarePrice: Number(board.squarePrice) || 0,
      spent: squares.length * (Number(board.squarePrice) || 0),
      periods,
      winCount: periods.filter(p => p.won).length,
      wonAmount: periods.reduce((sum, p) => sum + p.amount, 0),
      trackedAt: tracked.updatedAt || null,
      createdAt: board.createdAt || null
    });
  }

  wins.sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
  games.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const totalSpent = games.reduce((sum, g) => sum + g.spent, 0);

  return {
    totals: {
      gamesPlayed: games.length,
      squaresTracked,
      periodsPlayed,
      wins: wins.length,
      winRate: periodsPlayed > 0 ? wins.length / periodsPlayed : 0,
      totalWinnings,
      totalSpent,
      net: totalWinnings - totalSpent
    },
    wins,
    games
  };
}

module.exports = { computeAnalytics, PERIOD_LABELS };
