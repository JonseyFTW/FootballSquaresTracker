import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom'
import Landing from './components/Landing'
import BoardList from './components/BoardList'
import BoardView from './components/BoardView'
import CreateBoard from './components/CreateBoard'
import AuthPage from './components/AuthPage'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import Leagues from './components/Leagues'
import LeagueView from './components/LeagueView'
import LeagueShare from './components/LeagueShare'
import Analytics from './components/Analytics'
import InstallBanner from './components/InstallBanner'
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
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to={user ? '/boards' : '/'} className="logo">
          <span className="logo-mark">🏈</span>
          <span className="logo-word">Square<em>SZN</em></span>
        </Link>

        <nav className="nav">
          {user ? (
            <>
              <NavLink to="/boards" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                My Boards
              </NavLink>
              <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Create
              </NavLink>
              <NavLink to="/leagues" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Leagues
              </NavLink>
              <NavLink to="/me" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                My Stats
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/boards" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Boards
              </NavLink>
              <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Create
              </NavLink>
            </>
          )}
        </nav>

        <div className="account-bar">
          {user ? (
            <>
              <span className="account-name">Hi, {user.name.split(' ')[0]}</span>
              <button className="account-link" onClick={logout}>Sign Out</button>
            </>
          ) : (
            <>
              <Link className="account-link" to="/login">Sign In</Link>
              <Link className="btn btn-primary btn-small" to="/register">Start Free</Link>
            </>
          )}
        </div>
      </header>

      <main className="app-container">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/boards" element={<BoardList />} />
          <Route path="/create" element={<RequireAuth><CreateBoard /></RequireAuth>} />
          <Route path="/board/:id" element={<BoardView />} />
          <Route path="/share/:token" element={<BoardView shareMode />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/leagues" element={<RequireAuth><Leagues /></RequireAuth>} />
          <Route path="/league/share/:token" element={<LeagueShare />} />
          <Route path="/league/:id" element={<RequireAuth><LeagueView /></RequireAuth>} />
          <Route path="/me" element={<RequireAuth><Analytics /></RequireAuth>} />
        </Routes>
      </main>

      <footer className="site-footer">
        <span className="footer-brand">🏈 SquareSZN — squareszn.com</span>
        <nav className="footer-links">
          <Link to="/create">Create a board</Link>
          <Link to="/boards">Boards</Link>
          {user ? <Link to="/leagues">Leagues</Link> : <Link to="/register">Create account</Link>}
        </nav>
        <span className="footer-note">Live scores courtesy of ESPN's public scoreboard</span>
      </footer>

      <InstallBanner />
    </div>
  )
}

export default App
