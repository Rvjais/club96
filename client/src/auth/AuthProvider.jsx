import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { AuthContext, useAuth } from './authContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState(0)
  const [status, setStatus] = useState('loading') // loading | authed | guest

  const apply = useCallback((data) => {
    setUser(data.user)
    setBalance(data.balance)
    setStatus('authed')
    return data
  }, [])

  const refresh = useCallback(async () => {
    try {
      return apply(await api.get('/auth/me'))
    } catch (err) {
      // Logged out, session expired, or API unreachable → treat as guest
      setUser(null)
      setStatus('guest')
      throw err
    }
  }, [apply])

  // Restore the session on first load
  useEffect(() => {
    let cancelled = false
    api.get('/auth/me').then(
      (data) => !cancelled && apply(data),
      () => {
        if (cancelled) return
        setUser(null)
        setStatus('guest')
      },
    )
    return () => { cancelled = true }
  }, [apply])

  const value = useMemo(
    () => ({
      user,
      balance,
      status,
      setBalance,
      refresh,
      login: async (countryCode, phone, password) => apply(await api.post('/auth/login', { countryCode, phone, password })),
      signup: async (fields) => apply(await api.post('/auth/signup', fields)),
      logout: async () => {
        await api.post('/auth/logout').catch(() => {})
        setUser(null)
        setBalance(0)
        setStatus('guest')
      },
      deposit: async (amount) => {
        const data = await api.post('/wallet/deposit', { amount })
        setBalance(data.balance)
        return data
      },
    }),
    [user, balance, status, refresh, apply],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Renders children only for logged-in users; otherwise redirects to /login. */
export function RequireAuth({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') {
    return (
      <div className="app-loading">
        <span className="game-loading-spinner" />
      </div>
    )
  }
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
