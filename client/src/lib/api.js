// Thin fetch wrapper for the Express API (same origin; Vite proxies /api in dev).

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong')
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
}

/**
 * Subscribe to a server-sent event stream of JSON snapshots.
 * Returns an unsubscribe function.
 */
export function subscribe(path, onSnapshot, onError) {
  const es = new EventSource(`/api${path}`, { withCredentials: true })
  es.onmessage = (e) => {
    try {
      onSnapshot(JSON.parse(e.data))
    } catch {
      /* ignore malformed frames */
    }
  }
  es.onerror = () => onError?.()
  return () => es.close()
}
