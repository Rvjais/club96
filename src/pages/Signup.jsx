import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
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
          <div className="auth-header-title">Register</div>
          <div className="auth-header-sub">Please register by phone number or email</div>
        </div>

        {/* ── Body ── */}
        <div className="auth-body">

          {/* Tab strip */}
          <div className="auth-tab-strip">
            <div className="auth-tab-icon">
                            <Icon name="phone" />
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

              {/* Set password */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                                        <Icon name="lock" />
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
                  <button type="button" className="eye-btn" aria-label="Toggle password visibility" onClick={() => setShowPw(!showPw)}>
                    <Icon name={showPw ? "eyeOff" : "eye"} size={19} />
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                    <Icon name="lock" />
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
                  <button type="button" className="eye-btn" aria-label="Toggle password visibility" onClick={() => setShowCf(!showCf)}>
                    <Icon name={showCf ? "eyeOff" : "eye"} size={19} />
                  </button>
                </div>
              </div>

              {/* Invite code */}
              <div>
                <div className="field-label-row">
                  <div className="field-icon">
                                        <Icon name="userPlus" />
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
