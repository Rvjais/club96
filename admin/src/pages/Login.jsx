import { useState } from 'react'
import { api } from '../api'
import { Icon } from '../Icons'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!username || !password) return setError('Enter your username and password')
    setBusy(true)
    setError('')
    try {
      const { admin } = await api.post('/login', { username, password })
      onLogin(admin)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-ring brand-ring-lg">55</span>
          <h1>Admin panel</h1>
          <p>Sign in to manage players and wallets</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </div>
        )}

        <label className="field">
          <span>Username</span>
          <div className="input">
            <Icon name="user" size={16} />
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          </div>
        </label>

        <label className="field">
          <span>Password</span>
          <div className="input">
            <Icon name="lock" size={16} />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="input-action" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password visibility">
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner spinner-sm spinner-light" /> : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
