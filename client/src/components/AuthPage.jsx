import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'
import GoogleButton from './GoogleButton'

function AuthPage({ mode }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isRegister = mode === 'register'
  useTitle(isRegister ? 'Create Account' : 'Sign In')

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const nextPath = new URLSearchParams(location.search).get('next') || '/boards'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = isRegister
        ? await register(email, password, name)
        : await login(email, password)
      if (!result.ok) {
        setError(result.data.error || 'Something went wrong')
        return
      }
      navigate(nextPath)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card auth-card">
      <h3>{isRegister ? 'Create Your Account' : 'Sign In'}</h3>
      <p className="live-hint">
        {isRegister
          ? 'Run leagues, share boards, and track how your squares do over time.'
          : 'Welcome back — sign in to manage your leagues and see your stats.'}
      </p>

      <GoogleButton mode={isRegister ? 'signup' : 'signin'} nextPath={nextPath} />

      <form className="create-board-form" onSubmit={handleSubmit}>
        {isRegister && (
          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="e.g., Chad Jones"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Password {isRegister && <span className="side-tag">at least 8 characters</span>}</label>
          <input
            type="password"
            placeholder={isRegister ? 'Choose a password' : 'Your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        {!isRegister && (
          <p className="auth-forgot">
            <Link to="/forgot">Forgot password?</Link>
          </p>
        )}

        {error && <div className="track-error">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'One moment…' : (isRegister ? 'Create Account' : 'Sign In')}
        </button>
      </form>

      <p className="auth-switch">
        {isRegister ? (
          <>Already have an account? <Link to={`/login${location.search}`}>Sign in</Link></>
        ) : (
          <>New here? <Link to={`/register${location.search}`}>Create an account</Link></>
        )}
      </p>
    </div>
  )
}

export default AuthPage
