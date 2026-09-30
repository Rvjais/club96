import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { useAuth } from '../auth/authContext'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, status } = useAuth()
  const [countryCode, setCountryCode] = useState('+91')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = location.state?.from || '/game'
  if (status === 'authed' && !submitting) return <Navigate to={redirectTo} replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!phone || !password) {
      setError('Please fill in all fields.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(countryCode, phone, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
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

          {/* Tab strip */}
          <div className="auth-tab-strip">
            <div className="auth-tab-icon">
              <Icon name="phone" />
            </div>
            <div className="auth-tab-label">Login with phone</div>
          </div>

          {error && <div className="auth-error" role="alert"><Icon name="circleAlert" size={15} /> {error}</div>}

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
                    <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} aria-label="Country code">
                      <option>+91</option>
                      <option>+1</option>
                      <option>+44</option>
                      <option>+971</option>
                    </select>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
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
                    autoComplete="current-password"
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

            <button type="submit" className="btn-main" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : 'Login'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/signup')}>
              No account? &nbsp;<span>Register now</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
