import { createContext, useContext, useState, useEffect } from 'react'
import { apiFetch, getToken, setToken } from './api'

const AuthContext = createContext({ user: null, authLoading: true })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const restore = async () => {
      if (!getToken()) {
        setAuthLoading(false)
        return
      }
      const { ok, data } = await apiFetch('/api/me')
      if (ok) {
        setUser(data.user)
      } else {
        setToken(null)
      }
      setAuthLoading(false)
    }
    restore()
  }, [])

  const login = async (email, password) => {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    if (result.ok) {
      setToken(result.data.token)
      setUser(result.data.user)
    }
    return result
  }

  const register = async (email, password, name) => {
    const result = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    })
    if (result.ok) {
      setToken(result.data.token)
      setUser(result.data.user)
    }
    return result
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  // Install a session issued outside login/register (e.g. password reset)
  const adoptSession = (token, newUser) => {
    setToken(token)
    setUser(newUser)
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, login, register, logout, adoptSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
