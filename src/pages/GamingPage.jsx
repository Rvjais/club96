import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { games } from '../games'
import './GamingPage.css'

const categories = [
  { label: 'Lobby', icon: 'home' },
  { label: 'Mini Game', icon: 'gamepad' },
  { label: 'Slots', icon: 'dices' },
  { label: 'Card', icon: 'club' },
  { label: 'Fishing', icon: 'fish' },
  { label: 'Sports', icon: 'trophy' },
  { label: 'Live', icon: 'radio' },
]

const recommendedGames = [
  { id: 'cricket', name: 'CRICKET', label: 'TG GAME', icon: 'trophy', bg: 'linear-gradient(160deg,#6fd35a 0%,#1a6b2f 70%)', glow: '#b5ff8a' },
  { id: 'dragon', name: 'DRAGONGEMS CLASH', label: 'TG GAME', icon: 'gem', bg: 'linear-gradient(160deg,#ffcf4d 0%,#7a4f00 75%)', glow: '#ffe8a0' },
  { id: 'vortex', name: 'VORTEX', label: 'TG GAME', icon: 'tornado', bg: 'linear-gradient(160deg,#5a5ae0 0%,#1a1a6b 75%)', glow: '#ff9d6b' },
]

const lotteryGames = [
  { id: 1, name: 'WIN GO', icon: 'timer', bg: 'linear-gradient(135deg,#1565c0,#42a5f5)', label: 'Guess number' },
  { id: 2, name: 'K3', icon: 'dices', bg: 'linear-gradient(135deg,#c62828,#ef9a9a)', label: 'Guess number' },
  { id: 3, name: '5D', icon: 'hash', bg: 'linear-gradient(135deg,#6a1b9a,#ce93d8)', label: 'Guess number' },
  { id: 4, name: 'MOTO RACING', icon: 'flag', bg: 'linear-gradient(135deg,#e65100,#ffb74d)', label: 'Guess number' },
]

const navItems = [
  { icon: 'home', label: 'Home' },
  { icon: 'gift', label: 'Activity', dot: true },
  { cta: true },
  { icon: 'megaphone', label: 'Promotion' },
  { icon: 'user', label: 'Account' },
]

export default function GamingPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Lobby')
  const [activeNav, setActiveNav] = useState('Home')
  const [spinning, setSpinning] = useState(false)
  const [slide, setSlide] = useState(0)
  const [tabThumb, setTabThumb] = useState({ left: 0, width: 40 })
  const tabsRef = useRef(null)
  const recRef = useRef(null)

  // Auto-advance banner dots
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % 3), 4000)
    return () => clearInterval(t)
  }, [])

  // Custom scroll indicator under the category tabs
  const syncThumb = () => {
    const el = tabsRef.current
    if (!el) return
    const ratio = el.clientWidth / el.scrollWidth
    const width = Math.max(20, ratio * 100)
    const left = (el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)) * (100 - width)
    setTabThumb({ left, width })
  }

  useEffect(() => {
    syncThumb()
    window.addEventListener('resize', syncThumb)
    return () => window.removeEventListener('resize', syncThumb)
  }, [])

  const scrollTabs = (dir) => tabsRef.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  const scrollRec = (dir) => {
    const el = recRef.current
    if (!el) return
    el.scrollBy({ left: dir * (el.clientWidth * 0.68), behavior: 'smooth' })
  }

  const refresh = () => {
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  return (
    <div className="gp-root">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="gp-header">
        <div className="gp-logo">
          <div className="gp-logo-ring">55</div>
          <span className="gp-logo-name">55CLUB</span>
        </div>
        <button type="button" className="gp-icon-btn" aria-label="Download app">
          <Icon name="download" size={22} strokeWidth={2.2} />
        </button>
      </header>

      {/* ── Notice bar ───────────────────────────────────── */}
      <div className="gp-notice">
        <Icon name="volume" size={18} className="gp-notice-icon" />
        <div className="gp-notice-track">
          <p>
            Remember to use our official website for gaming at https://55club.com/, and exercise caution while
            disclosing personal or financial information online.
          </p>
        </div>
        <button type="button" className="gp-notice-mail" aria-label="Messages">
          <Icon name="mail" size={18} />
          <span className="gp-red-dot" />
        </button>
      </div>

      {/* ── Scrollable body ──────────────────────────────── */}
      <main className="gp-body">
        {/* Hero banner */}
        <section className="gp-banner">
          <div className="gp-banner-inner">
            <div className="gp-banner-copy">
              <span className="gp-banner-kicker">
                <Icon name="zap" size={12} strokeWidth={2.4} /> Official App
              </span>
              <p className="gp-banner-text">Play &amp; Win<br />Real Cash Daily</p>
              <span className="gp-banner-warp">WARP</span>
            </div>
            <div className="gp-phones">
              <div className="gp-phone gp-phone-1"><span /></div>
              <div className="gp-phone gp-phone-2"><span /></div>
            </div>
            <div className="gp-banner-badge">55</div>
          </div>
          <div className="gp-dots">
            {[0, 1, 2].map((i) => (
              <button
                type="button"
                key={i}
                aria-label={`Slide ${i + 1}`}
                className={`gp-dot ${slide === i ? 'gp-dot-active' : ''}`}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
        </section>

        {/* Wallet + action buttons */}
        <section className="gp-wallet-row">
          <div className="gp-wallet">
            <div className="gp-wallet-label">
              <span className="gp-coin" /> Wallet balance
            </div>
            <div className="gp-wallet-amount">
              ₹28.00
              <button type="button" className={`gp-refresh ${spinning ? 'is-spinning' : ''}`} onClick={refresh} aria-label="Refresh balance">
                <Icon name="refresh" size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="gp-actions">
            <button type="button" className="gp-btn-withdraw">
              <Icon name="withdraw" size={18} strokeWidth={2.4} />
              Withdraw
            </button>
            <button type="button" className="gp-btn-deposit">
              <Icon name="deposit" size={18} strokeWidth={2.4} />
              Deposit
            </button>
          </div>
        </section>

        {/* Feature cards row */}
        <section className="gp-feature-row">
          <button type="button" className="gp-feature-card gp-fortune">
            <div className="gp-feature-wheel">
              <div className="gp-wheel-inner" />
            </div>
            <span className="gp-feature-label">Wheel<br />of fortune</span>
          </button>
          <button type="button" className="gp-feature-card gp-vip">
            <div className="gp-feature-crown">
              <Icon name="crown" size={30} strokeWidth={1.8} fill="rgba(255,213,79,0.9)" />
            </div>
            <span className="gp-feature-label">VIP<br />privileges</span>
          </button>
        </section>

        {/* Category tabs */}
        <section className="gp-tabs-wrap">
          <div className="gp-tabs" ref={tabsRef} onScroll={syncThumb}>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.label}
                className={`gp-tab ${activeTab === cat.label ? 'gp-tab-active' : ''}`}
                onClick={() => setActiveTab(cat.label)}
              >
                <Icon name={cat.icon} size={19} strokeWidth={2} />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
          <div className="gp-tabs-scroll">
            <button type="button" onClick={() => scrollTabs(-1)} aria-label="Scroll left">
              <Icon name="chevronLeft" size={12} strokeWidth={3} />
            </button>
            <div className="gp-tabs-track">
              <span style={{ left: `${tabThumb.left}%`, width: `${tabThumb.width}%` }} />
            </div>
            <button type="button" onClick={() => scrollTabs(1)} aria-label="Scroll right">
              <Icon name="chevronRight" size={12} strokeWidth={3} />
            </button>
          </div>
        </section>

        {/* Games (from the registry in src/games) */}
        <section className="gp-section">
          <div className="gp-section-header">
            <h2 className="gp-section-title">
              <span className="gp-title-icon"><Icon name="gamepad" size={15} strokeWidth={2.2} /></span>
              Games
            </h2>
            <span className="gp-section-count">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
          </div>
          <div className="gp-play-grid">
            {games.map((g) => (
              <button
                type="button"
                key={g.id}
                className="gp-play-card"
                style={{ background: g.bg, '--glow': g.glow }}
                onClick={() => navigate(g.path)}
              >
                {g.badge && (
                  <span className="gp-game-hot">
                    <Icon name="flame" size={10} strokeWidth={2.6} /> {g.badge}
                  </span>
                )}
                <div className="gp-play-art">
                  <Icon name={g.icon} size={46} strokeWidth={1.6} />
                </div>
                <div className="gp-play-info">
                  <div className="gp-play-name">{g.name}</div>
                  <div className="gp-play-tag">{g.tagline}</div>
                  <span className="gp-play-btn">
                    <Icon name="play" size={10} strokeWidth={2.6} fill="currentColor" /> Play
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Recommended Games */}
        <section className="gp-section">
          <div className="gp-section-header">
            <h2 className="gp-section-title">
              <Icon name="star" size={20} strokeWidth={1.5} fill="#f5c542" className="gp-star" />
              Recommended Games
            </h2>
            <div className="gp-section-nav">
              <button type="button" className="gp-nav-arrow" onClick={() => scrollRec(-1)} aria-label="Previous">
                <Icon name="chevronLeft" size={16} strokeWidth={2.6} />
              </button>
              <button type="button" className="gp-nav-arrow" onClick={() => scrollRec(1)} aria-label="Next">
                <Icon name="chevronRight" size={16} strokeWidth={2.6} />
              </button>
            </div>
          </div>
          <div className="gp-games-grid" ref={recRef}>
            {recommendedGames.map((g) => (
              <button
                type="button"
                key={g.id}
                className="gp-game-card"
                style={{ background: g.bg, '--glow': g.glow }}
              >
                <div className="gp-game-art">
                  <Icon name={g.icon} size={54} strokeWidth={1.6} />
                </div>
                <div className="gp-game-info">
                  <div className="gp-game-name">{g.name}</div>
                  <div className="gp-game-label">{g.label}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Lottery section */}
        <section className="gp-section">
          <div className="gp-lottery-header">
            <div className="gp-lottery-badge">8</div>
            <div>
              <h2 className="gp-section-title">Lottery</h2>
              <p className="gp-lottery-sub">The games are independently developed by our team, fun, fair, and safe</p>
            </div>
          </div>
          <div className="gp-lottery-grid">
            {lotteryGames.map((g) => (
              <button type="button" key={g.id} className="gp-lottery-card" style={{ background: g.bg }}>
                <div className="gp-lottery-ball">
                  <Icon name={g.icon} size={26} strokeWidth={2} />
                </div>
                <div className="gp-lottery-name">{g.name}</div>
                <div className="gp-lottery-label">{g.label}</div>
              </button>
            ))}
          </div>
        </section>

        <div style={{ height: 140 }} />
      </main>

      {/* ── Floating "Add to Desktop" ────────────────────── */}
      <button type="button" className="gp-add-desktop">
        <span className="gp-add-icon">55</span>
        Add to Desktop
      </button>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <nav className="gp-bottom-nav">
        {navItems.map((item) =>
          item.cta ? (
            <button type="button" key="cta" className="gp-nav-cta">
              <span className="gp-nav-cta-orb">
                <Icon name="gift" size={24} strokeWidth={2} />
              </span>
              <span className="gp-nav-cta-label">Get ₹500</span>
            </button>
          ) : (
            <button
              type="button"
              key={item.label}
              className={`gp-nav-item ${activeNav === item.label ? 'gp-nav-active' : ''}`}
              onClick={() => {
                setActiveNav(item.label)
                if (item.label === 'Account') navigate('/')
              }}
            >
              <span className="gp-nav-icon">
                <Icon name={item.icon} size={22} strokeWidth={activeNav === item.label ? 2.2 : 1.8} />
                {item.dot && <span className="gp-red-dot" />}
              </span>
              <span className="gp-nav-label">{item.label}</span>
            </button>
          ),
        )}
      </nav>
    </div>
  )
}
