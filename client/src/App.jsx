import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import BoardList from './components/BoardList'
import BoardView from './components/BoardView'
import CreateBoard from './components/CreateBoard'
import AuthPage from './components/AuthPage'
import Leagues from './components/Leagues'
import LeagueView from './components/LeagueView'
import LeagueShare from './components/LeagueShare'
import Analytics from './components/Analytics'
import { useAuth } from './AuthContext'

function RequireAuth({ children }) {
  const { user, authLoading } = useAuth()
  const location = useLocation()
  if (authLoading) {
    return <div className="loading"><div className="spinner"></div></div>
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return children
}

function App() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const isActive = (path) => location.pathname === path

  return (
    <div className="app-container">
      <header className="header">
        <h1>Football Squares Tracker</h1>
        <p>Track your squares and see what you need to win!</p>
        <div className="account-bar">
          {user ? (
            <>
              <span className="account-name">Hi, {user.name.split(' ')[0]}</span>
              <button className="account-link" onClick={logout}>Sign Out</button>
            </>
          ) : (
            <>
              <Link className="account-link" to="/login">Sign In</Link>
              <Link className="account-link accent" to="/register">Create Account</Link>
            </>
          )}
        </div>
      </header>

      <nav className="nav">
        <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
          My Boards
        </Link>
        <Link to="/create" className={`nav-link ${isActive('/create') ? 'active' : ''}`}>
          Create Board
        </Link>
        {user && (
          <>
            <Link to="/leagues" className={`nav-link ${location.pathname.startsWith('/league') ? 'active' : ''}`}>
              My Leagues
            </Link>
            <Link to="/me" className={`nav-link ${isActive('/me') ? 'active' : ''}`}>
              My Stats
            </Link>
          </>
        )}
      </nav>

      <Routes>
        <Route path="/" element={<BoardList />} />
        <Route path="/create" element={<CreateBoard />} />
        <Route path="/board/:id" element={<BoardView />} />
        <Route path="/share/:token" element={<BoardView shareMode />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/leagues" element={<RequireAuth><Leagues /></RequireAuth>} />
        <Route path="/league/share/:token" element={<LeagueShare />} />
        <Route path="/league/:id" element={<RequireAuth><LeagueView /></RequireAuth>} />
        <Route path="/me" element={<RequireAuth><Analytics /></RequireAuth>} />
      </Routes>
    </div>
  )
}

export default App
