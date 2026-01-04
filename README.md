# Football Squares Tracker

A web application to track your football squares throughout a game and see what scores you need to win.

## Features

- **Multiple Board Types**: Supports both 5x5 (25 squares with paired digits) and 10x10 (100 squares) grids
- **Square Tracking**: Enter your square numbers to highlight them on the board
- **Winning Combinations**: See all the score combinations that would result in a win for your squares
- **Live Score Updates**: Update the game score and instantly see who's winning
- **Visual Indicators**: Winning squares are highlighted with animations
- **Square Management**: Click any square to assign an owner
- **Prize Tracking**: Set up prize amounts for each quarter/half/final

## Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Access the app at http://localhost:3001
```

## Development Setup

```bash
# Install all dependencies
npm run install:all

# Run in development mode (starts both server and client)
npm run dev

# Server runs on http://localhost:3001
# Client runs on http://localhost:5173
```

## How Football Squares Works

1. **The Grid**: A grid where the X-axis represents one team and the Y-axis represents the other
2. **The Numbers**: Each axis has digits 0-9 arranged randomly
3. **The Rule**: Winners are determined by the **last digit** of each team's score
4. **5x5 Boards**: Each cell covers 2 digits, giving each square 4 winning combinations
5. **10x10 Boards**: Each cell covers 1 digit, giving each square 1 winning combination

### Example
- Score: Chiefs 17, 49ers 24
- Chiefs last digit: 7
- 49ers last digit: 4
- The square at the intersection of column "7" and row "4" wins!

## API Endpoints

- `GET /api/boards` - List all boards
- `POST /api/boards` - Create a new board
- `GET /api/boards/:id` - Get a specific board
- `PUT /api/boards/:id/score` - Update game score
- `PUT /api/boards/:id/squares/:num` - Update square owner
- `GET /api/boards/:id/my-squares?squares=1,2,3` - Get winning combinations for specific squares
- `DELETE /api/boards/:id` - Delete a board

## Tech Stack

- **Frontend**: React 18 with Vite
- **Backend**: Node.js with Express
- **Containerization**: Docker
