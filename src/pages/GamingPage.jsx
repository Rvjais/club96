import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './GamingPage.css'

const categories = ['Lobby', 'Mini Game', 'Slots', 'Card', 'Fishing', 'Sports', 'Live']

const recommendedGames = [
  { id: 1, name: 'CRICKET', bg: '#1a6b2f', label: 'TG GAME' },
  { id: 2, name: 'DRAGONGEMS CLASH', bg: '#7a4f00', label: 'TG GAME' },
  { id: 3, name: 'VORTEX', bg: '#1a1a6b', label: 'TG GAME' },
]

const lotteryGames = [
  { id: 1, name: 'WIN GO', bg: 'linear-gradient(135deg,#1565c0,#42a5f5)', label: 'Guess number' },
  { id: 2, name: 'K3', bg: 'linear-gradient(135deg,#c62828,#ef9a9a)', label: 'Guess number' },
  { id: 3, name: '5D', bg: 'linear-gradient(135deg,#6a1b9a,#ce93d8)', label: 'Guess number' },
  { id: 4, name: 'MOTO RACING', bg: 'linear-gradient(135deg,#e65100,#ffb74d)', label: 'Guess number' },
]

const navItems = [
  { icon: '🏠', label: 'Home', active: true },
  { icon: '🎁', label: 'Activity' },
  { icon: '📣', label: 'Promotion' },
  { icon: '👤', label: 'Account' },
]

export default function GamingPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Lobby')
  const [activeNav, setActiveNav] = useState('Home')

  return (
    <div className="gp-root">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="gp-header">
        <div className="gp-logo">
          <div className="gp-logo-ring">55</div>
          <span className="gp-logo-name">55CLUB</span>
        </div>
        <div className="gp-header-icons">
          <button className="gp-icon-btn">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#e02020">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </button>
          <button className="gp-icon-btn gp-dl-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
              <path d="M5 20h14v-2H5v2zm7-18v12l-4-4-1.4 1.4L12 17l5.4-5.6L16 10l-4 4V2h-1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Notice bar ───────────────────────────────────── */}
      <div className="gp-notice">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#e02020" style={{flexShrink:0}}>
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
        <marquee>Remember to use our official website for gaming at https://55club.com/, and exercise caution while disclosing personal or financial information online.</marquee>
        <button className="gp-notice-mail">✉</button>
      </div>

      {/* ── Scrollable body ──────────────────────────────── */}
      <div className="gp-body">

        {/* Hero banner */}
        <div className="gp-banner">
          <div className="gp-banner-inner">
            <div className="gp-banner-left">
              <div className="gp-phones">
                <div className="gp-phone gp-phone-1" />
                <div className="gp-phone gp-phone-2" />
              </div>
            </div>
            <div className="gp-banner-right">
              <div className="gp-banner-badge">55</div>
              <p className="gp-banner-text">Play & Win<br />Real Cash Daily</p>
            </div>
            <div className="gp-banner-warp">WARP</div>
          </div>
          {/* Dot indicators */}
          <div className="gp-dots">
            <span className="gp-dot gp-dot-active" />
            <span className="gp-dot" />
            <span className="gp-dot" />
          </div>
        </div>

        {/* Wallet + action buttons */}
        <div className="gp-wallet-row">
          <div className="gp-wallet">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#f5c542">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18h-2v1.93A8.001 8.001 0 0 1 4 12c0-4.07 3.06-7.44 7-7.93V6h2V4.07A8.001 8.001 0 0 1 20 12a8.001 8.001 0 0 1-7 7.93z"/>
            </svg>
            <div>
              <div className="gp-wallet-label">Wallet balance</div>
              <div className="gp-wallet-amount">₹28.00 <span className="gp-refresh">&#8635;</span></div>
            </div>
          </div>
          <div className="gp-actions">
            <button className="gp-btn-withdraw">
              <span className="gp-btn-arrow">&#8593;</span> Withdraw
            </button>
            <button className="gp-btn-deposit">
              <span className="gp-btn-arrow">&#8595;</span> Deposit
            </button>
          </div>
        </div>

        {/* Feature cards row */}
        <div className="gp-feature-row">
          <div className="gp-feature-card gp-fortune">
            <div className="gp-feature-wheel">
              <div className="gp-wheel-inner" />
            </div>
            <span className="gp-feature-label">Wheel<br />of fortune</span>
          </div>
          <div className="gp-feature-card gp-vip">
            <div className="gp-feature-crown">&#9818;</div>
            <span className="gp-feature-label">VIP<br />privileges</span>
          </div>
        </div>

        {/* Category tabs */}
        <div className="gp-tabs-wrap">
          <div className="gp-tabs">
            {categories.map(cat => (
              <button
                key={cat}
                className={`gp-tab ${activeTab === cat ? 'gp-tab-active' : ''}`}
                onClick={() => setActiveTab(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="gp-tabs-scroll-bar" />
        </div>

        {/* Recommended Games */}
        <div className="gp-section">
          <div className="gp-section-header">
            <div className="gp-section-title">
              <span className="gp-star">&#9733;</span> Recommended Games
            </div>
            <div className="gp-section-nav">
              <button className="gp-nav-arrow">&#8249;</button>
              <button className="gp-nav-arrow">&#8250;</button>
            </div>
          </div>
          <div className="gp-games-grid">
            {recommendedGames.map(g => (
              <div key={g.id} className="gp-game-card" style={{ background: g.bg }}>
                <div className="gp-game-art" />
                <div className="gp-game-info">
                  <div className="gp-game-name">{g.name}</div>
                  <div className="gp-game-label">{g.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lottery section */}
        <div className="gp-section">
          <div className="gp-lottery-header">
            <div className="gp-lottery-badge">8</div>
            <div>
              <div className="gp-section-title" style={{marginBottom:2}}>Lottery</div>
              <div className="gp-lottery-sub">The games are independently developed by our team, fun, fair, and safe</div>
            </div>
          </div>
          <div className="gp-lottery-grid">
            {lotteryGames.map(g => (
              <div key={g.id} className="gp-lottery-card" style={{ background: g.bg }}>
                <div className="gp-lottery-name">{g.name}</div>
                <div className="gp-lottery-label">{g.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Add to Desktop */}
        <div className="gp-add-desktop">
          <div className="gp-add-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#e02020">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </div>
          <span>Add to Desktop</span>
        </div>

        {/* Bottom spacer for nav */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <div className="gp-bottom-nav">
        {navItems.map((item, i) => (
          <>
            {i === 2 && (
              <button key="cta" className="gp-nav-cta">
                Get ₹500
              </button>
            )}
            <button
              key={item.label}
              className={`gp-nav-item ${activeNav === item.label ? 'gp-nav-active' : ''}`}
              onClick={() => {
                setActiveNav(item.label)
                if (item.label === 'Account') navigate('/')
              }}
            >
              <span className="gp-nav-icon">{item.icon}</span>
              <span className="gp-nav-label">{item.label}</span>
            </button>
          </>
        ))}
      </div>
    </div>
  )
}
