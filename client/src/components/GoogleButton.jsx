import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../AuthContext'

// Loads Google Identity Services once per page
let gisScriptPromise = null
function loadGisScript() {
  if (!gisScriptPromise) {
    gisScriptPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve()
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = resolve
      script.onerror = () => {
        gisScriptPromise = null
        reject(new Error("Couldn't load Google sign-in — check your connection"))
      }
      document.head.appendChild(script)
    })
  }
  return gisScriptPromise
}

// Renders the official "Sign in with Google" button when the server has
// a GOOGLE_CLIENT_ID configured; renders nothing otherwise.
function GoogleButton({ mode = 'signin', nextPath = '/boards' }) {
  const { adoptSession } = useAuth()
  const navigate = useNavigate()
  const buttonRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const config = await apiFetch('/api/auth/config')
      const clientId = config.data?.googleClientId
      if (!clientId || cancelled) return

      try {
        await loadGisScript()
      } catch (err) {
        if (!cancelled) setError(err.message)
        return
      }
      if (cancelled || !buttonRef.current) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          const result = await apiFetch('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({ credential: response.credential })
          })
          if (!result.ok) {
            setError(result.data.error || 'Google sign-in failed')
            return
          }
          adoptSession(result.data.token, result.data.user)
          navigate(nextPath)
        }
      })

      buttonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        width: 320
      })
      setReady(true)
    }

    setup()
    return () => { cancelled = true }
  }, [mode, nextPath])

  return (
    <div className="google-auth">
      <div ref={buttonRef} className="google-button-host"></div>
      {error && <div className="track-error" style={{ marginTop: '10px' }}>{error}</div>}
      {ready && (
        <div className="import-divider" style={{ margin: '18px 0 2px', width: '100%' }}>
          <span>or use email</span>
        </div>
      )}
    </div>
  )
}

export default GoogleButton
