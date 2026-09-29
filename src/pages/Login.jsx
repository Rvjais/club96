import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Auth.css'

// ── Test credentials (remove when connecting real backend) ──────
const ADMIN_CREDENTIALS = {
  phone: '9999999999',
  password: 'admin123',
}

export default function Login() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!phone || !password) {
      setError('Please fill in all fields.')
      return
    }
    // Check admin test credentials
    if (phone === ADMIN_CREDENTIALS.phone && password === ADMIN_CREDENTIALS.password) {
      navigate('/game')
      return
    }
    // Wrong credentials
    setError('Invalid phone number or password. Use admin credentials below.')
  }

  // Autofill admin credentials
  const fillAdmin = () => {
    setPhone(ADMIN_CREDENTIALS.phone)
    setPassword(ADMIN_CREDENTIALS.password)
    setError('')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* ── Red header ── */}
        <div className="auth-header">
          <div className="auth-header-top">
            <button className="auth-back" onClick={() => navigate('/')}>&#8249;</button>
            <div className="auth-logo">
              <div className="auth-logo-ring">55</div>
              <span className="auth-logo-name">55CLUB</span>
            </div>
            <div className="auth-lang">
              <div className="auth-flag" />
              EN
            </div>
          </div>
          <div className="auth-header-title">Login</div>
          <div className="auth-header-sub">Please login by phone number or email</div>
        </div>

        {/* ── Body ── */}
        <div className="auth-body">

          {/* Admin test credentials box */}
          <div className="admin-hint">
            <div className="admin-hint-title">Admin Test Account</div>
            <div className="admin-hint-row">
              <span>Phone:</span>
              <code>{ADMIN_CREDENTIALS.phone}</code>
            </div>
            <div className="admin-hint-row">
              <span>Password:</span>
              <code>{ADMIN_CREDENTIALS.password}</code>
            </div>
            <button type="button" className="admin-hint-fill" onClick={fillAdmin}>
              Auto-fill credentials
            </button>
          </div>

          {/* Tab strip */}
          <div className="auth-tab-strip">
            <div className="auth-tab-icon">
              <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </div>
            <div className="auth-tab-label">Login with phone</div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-fields">

              {/* Phone number */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                  </div>
                  <span className="field-label">Phone number</span>
                </div>
                <div className="input-box">
                  <div className="phone-prefix">
                    <select>
                      <option>+91</option>
                      <option>+1</option>
                      <option>+44</option>
                      <option>+971</option>
                    </select>
                  </div>
                  <input
                    type="tel"
                    placeholder="Please enter the phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                  </div>
                  <span className="field-label">Password</span>
                </div>
                <div className="input-box">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPw(!showPw)}>
                    {showPw ? '👁' : '🙈'}
                  </button>
                </div>
              </div>

            </div>

            <button type="submit" className="btn-main">Login</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/signup')}>
              No account? &nbsp;<span>Register now</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
