import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Auth.css'

export default function Signup() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!phone || !password || !confirm) { setError('Please fill in all fields.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (!agreed) { setError('Please agree to the Privacy Agreement.'); return }
    navigate('/game')
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
          <div className="auth-header-title">Register</div>
          <div className="auth-header-sub">Please register by phone number or email</div>
        </div>

        {/* ── Body ── */}
        <div className="auth-body">

          {/* Tab strip */}
          <div className="auth-tab-strip">
            <div className="auth-tab-icon">
              {/* phone icon */}
              <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </div>
            <div className="auth-tab-label">Register your phone</div>
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

              {/* Set password */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    {/* lock icon */}
                    <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                  </div>
                  <span className="field-label">Set password</span>
                </div>
                <div className="input-box">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Set password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPw(!showPw)}>
                    {showPw ? '👁' : '🙈'}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                  </div>
                  <span className="field-label">Confirm password</span>
                </div>
                <div className="input-box">
                  <input
                    type={showCf ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowCf(!showCf)}>
                    {showCf ? '👁' : '🙈'}
                  </button>
                </div>
              </div>

              {/* Invite code */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    {/* person icon */}
                    <svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  </div>
                  <span className="field-label">Invite code</span>
                </div>
                <div className="input-box">
                  <input type="text" defaultValue="681727078287" />
                </div>
              </div>

            </div>

            {/* Privacy */}
            <label className="privacy-row">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I have read and agree
              <a href="#" className="privacy-link">[Privacy Agreement]</a>
            </label>

            <button type="submit" className="btn-main">Register</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/login')}>
              I have an account &nbsp;<span>Login</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
