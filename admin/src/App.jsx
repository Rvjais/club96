import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import { Icon } from './Icons'
import Login from './pages/Login'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import GameSettings from './pages/GameSettings'

function Layout({ admin, onLogout, children }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-ring">55</span>
          <div>
            <strong>55CLUB</strong>
            <span>Admin</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="users" /> Users
          </NavLink>
          <NavLink to="/games" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="sliders" /> Game settings
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <span className="avatar">{admin.username[0]?.toUpperCase()}</span>
            <div>
              <strong>{admin.username}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onLogout} title="Log out" aria-label="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}

export default function App() {
  const [admin, setAdmin] = useState(null)
  const [status, setStatus] = useState('loading') // loading | authed | guest

  useEffect(() => {
    let cancelled = false
    api.get('/me').then(
      (d) => { if (!cancelled) { setAdmin(d.admin); setStatus('authed') } },
      () => { if (!cancelled) setStatus('guest') },
    )
    const onUnauthorized = () => { setAdmin(null); setStatus('guest') }
    window.addEventListener('admin:unauthorized', onUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener('admin:unauthorized', onUnauthorized)
    }
  }, [])

  const onLogin = useCallback((a) => { setAdmin(a); setStatus('authed') }, [])
  const onLogout = useCallback(async () => {
    await api.post('/logout').catch(() => {})
    setAdmin(null)
    setStatus('guest')
  }, [])

  if (status === 'loading') {
    return (
      <div className="center-screen">
        <span className="spinner" />
      </div>
    )
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {status === 'guest' ? (
        <Routes>
          <Route path="*" element={<Login onLogin={onLogin} />} />
        </Routes>
      ) : (
        <Layout admin={admin} onLogout={onLogout}>
          <Routes>
            <Route path="/" element={<Users />} />
            <Route path="/users/:id" element={<UserDetail />} />
            <Route path="/games" element={<GameSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
    </BrowserRouter>
  )
}
