const TOKEN_KEY = 'sb.token'

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token) } catch { /* приватний режим */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* приватний режим */ }
  },
}

export class ApiError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = session.token
  let res
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('network', 0)
  }

  if (res.status === 401 && token && !headers['X-Partner-Key']) {
    session.clear()
    window.dispatchEvent(new Event('sb:logout'))
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) throw new ApiError(data?.error ?? (res.status === 401 ? 'forbidden' : res.status >= 500 ? 'unknown' : 'invalid'), res.status)
  return data
}

function safeJson(text) {
  try { return JSON.parse(text) } catch { return text }
}

export const api = {
  get: (p, opts) => request(p, opts),
  post: (p, body, opts) => request(p, { ...opts, method: 'POST', body: body ?? {} }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
}
