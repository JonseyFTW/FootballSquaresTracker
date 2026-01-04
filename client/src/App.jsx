import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import BoardList from './components/BoardList'
import BoardView from './components/BoardView'
import CreateBoard from './components/CreateBoard'

function App() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isCreate = location.pathname === '/create'

  return (
    <div className="app-container">
      <header className="header">
        <h1>Football Squares Tracker</h1>
        <p>Track your squares and see what you need to win!</p>
      </header>

      <nav className="nav">
        <Link to="/" className={`nav-link ${isHome ? 'active' : ''}`}>
          My Boards
        </Link>
        <Link to="/create" className={`nav-link ${isCreate ? 'active' : ''}`}>
          Create Board
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<BoardList />} />
        <Route path="/create" element={<CreateBoard />} />
        <Route path="/board/:id" element={<BoardView />} />
      </Routes>
    </div>
  )
}

export default App
