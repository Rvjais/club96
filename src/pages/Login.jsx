import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
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
            <button type="button" className="auth-back" onClick={() => navigate('/')} aria-label="Back">
              <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
            </button>
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
            <div className="admin-hint-title"><Icon name="key" size={15} /> Admin Test Account</div>
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
              <Icon name="phone" />
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
                    <Icon name="phone" />
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
                    <Icon name="lock" />
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
                  <button type="button" className="eye-btn" aria-label="Toggle password visibility" onClick={() => setShowPw(!showPw)}>
                    <Icon name={showPw ? "eyeOff" : "eye"} size={19} />
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
