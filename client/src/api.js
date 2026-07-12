// Fetch wrapper that attaches the auth token and always resolves with
// { ok, status, data } so callers never crash on error payloads.

const TOKEN_KEY = 'fst-auth-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(path, { ...options, headers })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    console.error(`API error for ${path}:`, error)
    return { ok: false, status: 0, data: { error: 'Network error — check your connection' } }
  }
}
