import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useTitle } from '../useTitle'

function ForgotPassword() {
  useTitle('Forgot Password')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/api/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email })
      })
      // The API always answers the same way — mirror that here
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card auth-card">
      <h3>Forgot Your Password?</h3>
      {sent ? (
        <>
          <p className="live-hint" style={{ marginBottom: '20px' }}>
            If an account exists for <strong style={{ color: 'var(--text-1)' }}>{email}</strong>,
            a reset link is on its way. It works once and expires in 30 minutes —
            check your spam folder if it doesn't show up.
          </p>
          <Link to="/login" className="btn btn-secondary" style={{ width: '100%' }}>
            Back to Sign In
          </Link>
        </>
      ) : (
        <>
          <p className="live-hint">
            Enter your account email and we'll send you a link to choose a new password.
          </p>
          <form className="create-board-form" onSubmit={handleSubmit}>
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
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <p className="auth-switch">
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        </>
      )}
    </div>
  )
}

export default ForgotPassword
