import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'
import { useTitle } from '../useTitle'

function ResetPassword() {
  useTitle('Reset Password')
  const navigate = useNavigate()
  const location = useLocation()
  const { adoptSession } = useAuth()
  const token = new URLSearchParams(location.search).get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Those passwords don't match")
      return
    }

    setLoading(true)
    try {
      const { ok, data } = await apiFetch('/api/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      })
      if (!ok) {
        setError(data.error || 'Failed to reset password')
        return
      }
      adoptSession(data.token, data.user)
      navigate('/boards')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="card auth-card">
        <h3>Reset Link Missing</h3>
        <p className="live-hint" style={{ marginBottom: '20px' }}>
          This page needs the link from your reset email. If yours expired,
          request a fresh one below.
        </p>
        <Link to="/forgot" className="btn btn-primary" style={{ width: '100%' }}>
          Request a New Link
        </Link>
      </div>
    )
  }

  return (
    <div className="card auth-card">
      <h3>Choose a New Password</h3>
      <form className="create-board-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>New Password <span className="side-tag">at least 8 characters</span></label>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Same password again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && (
          <div className="track-error">
            {error} {error.includes('link') && <Link to="/forgot" style={{ color: 'var(--primary-1)' }}>Request a new one</Link>}
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Set Password & Sign In'}
        </button>
      </form>
    </div>
  )
}

export default ResetPassword
