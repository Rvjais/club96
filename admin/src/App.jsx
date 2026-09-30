import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import { Icon } from './Icons'
import Login from './pages/Login'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import GameSettings from './pages/GameSettings'
import Withdrawals from './pages/Withdrawals'
import Deposits from './pages/Deposits'
import Support from './pages/Support'
import Dashboard from './pages/Dashboard'

function Layout({ admin, onLogout, pending, pendingDeposits, unreadChats, children }) {
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
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="barChart" /> <span>Dashboard</span>
          </NavLink>
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="users" /> <span>Users</span>
          </NavLink>
          <NavLink to="/deposits" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="wallet" /> <span>Deposits</span>
            {pendingDeposits > 0 && <em className="nav-badge">{pendingDeposits}</em>}
          </NavLink>
          <NavLink to="/withdrawals" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="banknote" /> <span data-short="Payouts">Withdrawals</span>
            {pending > 0 && <em className="nav-badge">{pending}</em>}
          </NavLink>
          <NavLink to="/support" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="message" /> <span data-short="Chat">Customer chat</span>
            {unreadChats > 0 && <em className="nav-badge nav-badge-green">{unreadChats}</em>}
          </NavLink>
          <NavLink to="/games" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="sliders" /> <span data-short="Settings">Game settings</span>
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
  const [pending, setPending] = useState(0)
  const [pendingDeposits, setPendingDeposits] = useState(0)
  const [unreadChats, setUnreadChats] = useState(0)

  // Keep the sidebar's pending deposit / withdrawal badges fresh
  useEffect(() => {
    if (status !== 'authed') return
    let cancelled = false
    const poll = () => {
      api.get('/withdrawals?status=pending').then((d) => !cancelled && setPending(d.pendingCount), () => {})
      api.get('/deposits?status=pending').then((d) => !cancelled && setPendingDeposits(d.pendingCount), () => {})
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [status])

  // Unread customer-service messages: sidebar badge + tab title
  useEffect(() => {
    if (status !== 'authed') return
    let cancelled = false
    const poll = () => api.get('/support/unread').then((d) => !cancelled && setUnreadChats(d.unread), () => {})
    poll()
    const t = setInterval(poll, 10000)
    return () => { cancelled = true; clearInterval(t) }
  }, [status])

  useEffect(() => {
    document.title = unreadChats > 0 ? `(${unreadChats}) 55CLUB Admin` : '55CLUB Admin'
  }, [unreadChats])

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
        <Layout admin={admin} onLogout={onLogout} pending={pending} pendingDeposits={pendingDeposits} unreadChats={unreadChats}>
          <Routes>
            <Route path="/" element={<Users />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/users/:id" element={<UserDetail />} />
            <Route path="/games" element={<GameSettings />} />
            <Route path="/deposits" element={<Deposits onCountChange={setPendingDeposits} />} />
            <Route path="/withdrawals" element={<Withdrawals onCountChange={setPending} />} />
            <Route path="/support" element={<Support onUnreadChange={setUnreadChats} />} />
            <Route path="/support/:id" element={<Support onUnreadChange={setUnreadChats} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
    </BrowserRouter>
  )
}
