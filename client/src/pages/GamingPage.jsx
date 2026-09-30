import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { gameCategories, games } from '../games'
import { useAuth } from '../auth/authContext'
import BottomNav from '../components/BottomNav'
import Popup from '../components/Popup'
import { money } from '../lib/format'
import { useSiteConfig } from '../lib/siteConfig'
import { useSupportUnread } from '../lib/supportUnread'
import './GamingPage.css'

const wingo = games.find((g) => g.id === 'wingo')
const wheel = games.find((g) => g.id === 'wheel')
const ROOM_STYLES = {
  '30s': { bg: 'linear-gradient(135deg,#ff6b6b,#e02020)', label: 'Draw every 30 seconds' },
  '1m': { bg: 'linear-gradient(135deg,#ff9800,#ffb74d)', label: 'Draw every minute' },
  '3m': { bg: 'linear-gradient(135deg,#8e24aa,#ce93d8)', label: 'Draw every 3 minutes' },
  '5m': { bg: 'linear-gradient(135deg,#1565c0,#42a5f5)', label: 'Draw every 5 minutes' },
}

export default function GamingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const config = useSiteConfig()
  const unread = useSupportUnread()
  // Shown once, right after sign-up (passed in the navigation state by Signup)
  const [welcome, setWelcome] = useState(() => location.state?.welcomeBonus ?? null)
  const [lowBalance, setLowBalance] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [spinning, setSpinning] = useState(false)
  const [toast, setToast] = useState(null)
  const { balance, refresh: refreshWallet } = useAuth()
  const [slide, setSlide] = useState(0)
  const [tabThumb, setTabThumb] = useState({ left: 0, width: 40 })
  const tabsRef = useRef(null)

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

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2400)
  }

  const refresh = async () => {
    setSpinning(true)
    await Promise.all([refreshWallet().catch(() => {}), new Promise((r) => setTimeout(r, 600))])
    setSpinning(false)
  }

  const closeWelcome = () => {
    setWelcome(null)
    navigate(location.pathname, { replace: true, state: null }) // don't show it again on reload
  }

  // Games need the admin-set minimum balance in the wallet (the server enforces it too)
  const minPlay = config?.minPlayBalance ?? 0
  const play = (path) => {
    if (balance < minPlay) setLowBalance(true)
    else navigate(path)
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
        <button type="button" className="gp-notice-mail" aria-label="Customer service" onClick={() => navigate('/support')}>
          <Icon name="mail" size={18} />
          {unread > 0 && <span className="gp-red-dot" />}
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
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <button type="button" className={`gp-refresh ${spinning ? 'is-spinning' : ''}`} onClick={refresh} aria-label="Refresh balance">
                <Icon name="refresh" size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="gp-actions">
            <button type="button" className="gp-btn-withdraw" onClick={() => navigate('/account?open=withdraw')}>
              <Icon name="withdraw" size={18} strokeWidth={2.4} />
              Withdraw
            </button>
            <button type="button" className="gp-btn-deposit" onClick={() => navigate('/account?open=deposit')}>
              <Icon name="deposit" size={18} strokeWidth={2.4} />
              Deposit
            </button>
          </div>
        </section>

        {/* Feature cards row */}
        <section className="gp-feature-row">
          <button type="button" className="gp-feature-card gp-fortune" onClick={() => play('/games/wheel')}>
            <img className="gp-feature-img" src={wheel.image} alt="" />
            <span className="gp-feature-label">Wheel<br />of fortune</span>
          </button>
          <button type="button" className="gp-feature-card gp-vip" onClick={() => play('/games/wingo?room=30s')}>
            <img className="gp-feature-img" src={wingo.image} alt="" />
            <span className="gp-feature-label">Win Go<br />30s rounds</span>
          </button>
        </section>

        {/* Category tabs */}
        <section className="gp-tabs-wrap">
          <div className="gp-tabs" ref={tabsRef} onScroll={syncThumb}>
            {gameCategories.map((cat) => (
              <button
                type="button"
                key={cat.key}
                className={`gp-tab ${activeTab === cat.key ? 'gp-tab-active' : ''}`}
                onClick={() => setActiveTab(cat.key)}
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

        {/* Game sections (from the registry in src/games) */}
        {gameCategories.filter((c) => c.key !== 'all' && (activeTab === 'all' || activeTab === c.key)).map((cat) => {
          const list = games.filter((g) => g.category === cat.key)
          if (!list.length) return null
          return (
            <section key={cat.key} className="gp-section">
              <div className="gp-lottery-header">
                <div className="gp-lottery-badge"><Icon name={cat.icon} size={16} strokeWidth={2.2} /></div>
                <div>
                  <h2 className="gp-section-title">{cat.title}</h2>
                  <p className="gp-lottery-sub">{cat.sub}</p>
                </div>
              </div>

              {cat.key === 'lottery' && wingo ? (
                <div className="gp-lottery-grid">
                  {wingo.rooms.map((room) => (
                    <button
                      type="button"
                      key={room.key}
                      className="gp-lottery-card"
                      style={{ background: ROOM_STYLES[room.key].bg }}
                      onClick={() => play(`${wingo.path}?room=${room.key}`)}
                    >
                      <img className="gp-lottery-ball" src={wingo.image} alt="" />
                      <div className="gp-lottery-name">{room.label}</div>
                      <div className="gp-lottery-label">{ROOM_STYLES[room.key].label}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="gp-play-grid">
                  {list.map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      className="gp-play-card"
                      style={{ background: g.bg, '--glow': g.glow }}
                      onClick={() => play(g.path)}
                    >
                      {g.badge && (
                        <span className="gp-game-hot">
                          <Icon name="flame" size={10} strokeWidth={2.6} /> {g.badge}
                        </span>
                      )}
                      <img className="gp-play-art" src={g.image} alt="" />
                      <div className="gp-play-info">
                        <div className="gp-play-name">{g.name}</div>
                        <span className="gp-play-btn">
                          <Icon name="play" size={10} strokeWidth={2.6} fill="currentColor" /> Play
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}

        <div style={{ height: 140 }} />
      </main>

      {/* ── Floating "Add to Desktop" ────────────────────── */}
      <button type="button" className="gp-add-desktop">
        <span className="gp-add-icon">55</span>
        Add to Desktop
      </button>

      {toast && (
        <div key={toast.id} className={`gp-toast gp-toast-${toast.kind}`} role="status">
          <Icon name={toast.kind === 'success' ? 'circleCheck' : toast.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
          {toast.text}
        </div>
      )}

      <Popup
        open={Boolean(welcome)}
        icon="gift"
        kicker="Sign-up bonus"
        title={welcome?.title}
        amount={welcome && money(welcome.amount)}
        onClose={closeWelcome}
        actions={[{ label: 'Claim & start playing', primary: true, onClick: closeWelcome }]}
      >
        {welcome?.message}
      </Popup>

      <Popup
        open={lowBalance}
        tone="warn"
        icon="wallet"
        kicker="Minimum balance"
        title="Add money to play"
        onClose={() => setLowBalance(false)}
        actions={[
          { label: 'Deposit now', primary: true, onClick: () => navigate('/account?open=deposit') },
          { label: 'Not now', onClick: () => setLowBalance(false) },
        ]}
      >
        You need at least <strong>{money(minPlay)}</strong> in your wallet to play any game.
        Your balance is <strong>{money(balance)}</strong>.
      </Popup>

      <BottomNav onSoon={(text) => showToast('info', text)} />
    </div>
  )
}
