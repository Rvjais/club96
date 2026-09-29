import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { createAviatorEngine, getInitialSnapshot, WAIT_MS } from './aviatorEngine'
import { subscribe } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { createAviatorAudio } from './aviatorAudio'
import { drawScene } from './aviatorCanvas'
import './Aviator.css'

const QUICK_AMOUNTS = [10, 50, 100, 500]
const AVATAR_COLORS = ['#ff2d55', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6']
const RING_R = 42
const RING_C = 2 * Math.PI * RING_R

const formatMoney = (n) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const tierOf = (m) => (m >= 10 ? 'gold' : m >= 2 ? 'purple' : 'blue')

const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : 'generating…')

const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// ─────────────────────────────────────────────────────────────
// Bet panel
// ─────────────────────────────────────────────────────────────
function BetPanel({ id, accent, phase, panel, amount, onAmount, auto, onAuto, onAction, estimateRef, hotkey, pending, paused }) {
  const locked = panel.status !== 'idle'
  const value = parseFloat(amount) || 0

  const step = (delta) => onAmount(Math.max(1, value + delta).toFixed(2))

  let variant = 'bet'
  let label = 'Bet'
  let sub = phase === 'waiting' ? formatMoney(value) : `Next round · ${formatMoney(value)}`
  if (panel.status === 'placed') {
    variant = 'cancel'
    label = 'Cancel'
    sub = 'Waiting for takeoff'
  } else if (panel.status === 'queued') {
    variant = 'queued'
    label = 'Cancel'
    sub = 'Queued for next round'
  } else if (panel.status === 'flying') {
    variant = 'cashout'
    label = 'Cash out'
    sub = formatMoney(panel.amount)
  }
  if (paused && panel.status === 'idle') {
    variant = 'queued'
    label = 'Paused'
    sub = 'Betting is closed'
  }
  const blocked = paused && panel.status === 'idle'
  const autoLocked = locked || pending

  return (
    <div className={`av-panel ${panel.status === 'flying' ? 'is-live' : ''}`}>
      <div className="av-panel-head">
        <span className="av-panel-title">
          <span className="av-dot" style={{ background: accent }} /> Bet {id}
          {hotkey && <kbd className="av-kbd">{hotkey}</kbd>}
        </span>
        <div className="av-auto">
          <span>Auto<span className="av-auto-long"> cash out</span></span>
          <button
            type="button"
            role="switch"
            aria-checked={auto.enabled}
            className={`av-switch ${auto.enabled ? 'on' : ''}`}
            disabled={autoLocked}
            title={autoLocked ? 'Auto cash out is fixed once the bet is placed' : undefined}
            onClick={() => onAuto({ ...auto, enabled: !auto.enabled })}
          >
            <span />
          </button>
          <div className={`av-auto-input ${auto.enabled && !autoLocked ? '' : 'is-off'}`}>
            <input
              type="number"
              step="0.1"
              min="1.01"
              value={auto.value}
              disabled={!auto.enabled || autoLocked}
              onChange={(e) => onAuto({ ...auto, value: e.target.value })}
              aria-label={`Auto cash out multiplier for bet ${id}`}
            />
            <span>x</span>
          </div>
        </div>
      </div>

      <div className="av-panel-body">
        <div className="av-amount-col">
          <div className={`av-stepper ${locked ? 'is-locked' : ''}`}>
            <button type="button" onClick={() => step(-10)} disabled={locked} aria-label="Decrease">
              <Icon name="minus" size={16} strokeWidth={2.4} />
            </button>
            <div className="av-stepper-field">
              <span>₹</span>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                disabled={locked}
                onChange={(e) => onAmount(e.target.value)}
                onBlur={() => onAmount(Math.max(1, value).toFixed(2))}
                aria-label={`Bet amount ${id}`}
              />
            </div>
            <button type="button" onClick={() => step(10)} disabled={locked} aria-label="Increase">
              <Icon name="plus" size={16} strokeWidth={2.4} />
            </button>
          </div>
          <div className="av-chips">
            {QUICK_AMOUNTS.map((q) => (
              <button
                type="button"
                key={q}
                disabled={locked}
                className={value === q ? 'is-active' : ''}
                onClick={() => onAmount(q.toFixed(2))}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={`av-action av-action-${variant} ${pending ? 'is-pending' : ''}`} onClick={onAction} disabled={pending || blocked}>
          <span className="av-action-label">{label}</span>
          <span className="av-action-sub" ref={variant === 'cashout' ? estimateRef : null}>
            {sub}
          </span>
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function Aviator() {
  const navigate = useNavigate()
  const { setBalance, refresh } = useAuth()

  const [snap, setSnap] = useState(getInitialSnapshot)
  const [amounts, setAmounts] = useState({ 1: '10.00', 2: '20.00' })
  const [auto, setAuto] = useState({ 1: { enabled: false, value: '2.00' }, 2: { enabled: false, value: '3.00' } })
  const [tab, setTab] = useState('all')
  const [toasts, setToasts] = useState([])
  const [soundOn, setSoundOn] = useState(true)
  const [fairOpen, setFairOpen] = useState(false)
  const [online, setOnline] = useState(1284)

  const engineRef = useRef(null)
  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const multRef = useRef(null)
  const altRef = useRef(null)
  const ringRef = useRef(null)
  const countRef = useRef(null)
  const estimateRefs = useRef({ 1: null, 2: null })
  const sizeRef = useRef({ w: 0, h: 0 })

  const pushToast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  // Engine + audio lifecycle
  useEffect(() => {
    const audio = createAviatorAudio()
    audioRef.current = audio

    const renderFrame = (f) => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        const { w, h } = sizeRef.current
        if (w && h) drawScene(ctx, w, h, f)
      }
      if (f.phase === 'flying') {
        if (multRef.current) multRef.current.textContent = f.mult.toFixed(2) + 'x'
        if (altRef.current) altRef.current.textContent = `${Math.floor(f.flightSec * 140).toLocaleString('en-IN')} m`
        for (const id of [1, 2]) {
          const el = estimateRefs.current[id]
          const p = f.panels[id]
          if (el && p.status === 'flying') el.textContent = formatMoney(p.amount * f.mult)
        }
        audio.engineUpdate(f.mult)
      } else if (f.phase === 'waiting') {
        const left = f.waitLeft / WAIT_MS
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - left))
        if (countRef.current) countRef.current.textContent = (f.waitLeft / 1000).toFixed(1)
        if (altRef.current) altRef.current.textContent = '0 m'
      }
    }

    const engine = createAviatorEngine({
      onState: (next) => {
        setSnap(next)
        setBalance(next.balance)
      },
      onFrame: renderFrame,
      onEvent: (e) => {
        if (e.type === 'toast') pushToast(e.kind, e.text)
        else if (e.type === 'takeoff') audio.engineStart()
        else if (e.type === 'crash') audio.crash()
        else if (e.type === 'cashout') {
          audio.cashout()
          pushToast('success', `Bet ${e.panel} cashed out at ${e.mult.toFixed(2)}x  +${formatMoney(e.win)}`)
        }
      },
    })
    engineRef.current = engine
    engine.start()

    // Live round updates from the server; on stream errors re-check the session
    let lastCheck = 0
    const unsubscribe = subscribe('/games/aviator/stream', engine.sync, () => {
      if (Date.now() - lastCheck < 5000) return
      lastCheck = Date.now()
      refresh().catch(() => {})
    })

    return () => {
      unsubscribe()
      engine.stop()
      audio.dispose()
    }
  }, [pushToast, setBalance, refresh])

  // Crisp, DPR-aware canvas sizing
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w: width, h: height }
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // Dark page background while mounted
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#0f141c'
    return () => { document.body.style.background = prev }
  }, [])

  // Fluctuating online counter
  useEffect(() => {
    const t = setInterval(() => setOnline((n) => Math.max(900, n + Math.round((Math.random() - 0.45) * 24))), 3500)
    return () => clearInterval(t)
  }, [])

  const doAction = useCallback((id) => {
    audioRef.current?.unlock()
    engineRef.current?.action(id, amounts[id], auto[id])
  }, [amounts, auto])

  // Space = bet / cash out on panel 1, Escape closes modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setFairOpen(false)
      if (e.code !== 'Space' || e.repeat) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      e.preventDefault()
      doAction(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doAction])

  const updateAuto = (id, next) => setAuto((a) => ({ ...a, [id]: next }))

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    audioRef.current?.setEnabled(next)
    if (next) audioRef.current?.unlock()
  }

  const { ready, phase, balance, history, panels, bots, userRound, myBets, round, prevRound, crashAt, pending, rules } = snap

  const totalBets = bots.length + userRound.length
  const totalStake = bots.reduce((s, b) => s + b.amount, 0) + userRound.reduce((s, u) => s + u.amount, 0)
  const totalWon =
    bots.reduce((s, b) => s + (b.cashMult ? b.amount * b.cashMult : 0), 0) +
    userRound.reduce((s, u) => s + (u.cashMult ? u.amount * u.cashMult : 0), 0)

  const stateBadge = {
    waiting: { cls: 'is-waiting', text: 'Betting open' },
    flying: { cls: 'is-flying', text: 'In flight' },
    crashed: { cls: 'is-crashed', text: 'Flew away' },
  }[phase]

  return (
    <div className="av-root" onPointerDown={() => audioRef.current?.unlock()}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="av-header">
        <div className="av-header-inner">
          <div className="av-header-left">
            <button type="button" className="av-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
              <Icon name="arrowLeft" size={18} />
            </button>
            <div className="av-brand">
              <div className="av-brand-mark">
                <Icon name="plane" size={20} strokeWidth={2} />
              </div>
              <div>
                <h1 className="av-brand-name">
                  <span className="av-brand-word">AVI<span>ATOR</span></span>
                  <em className="av-live-pill">Demo</em>
                </h1>
                <p className="av-brand-sub">Provably fair crash game</p>
              </div>
            </div>
          </div>

          <div className="av-header-right">
            <button
              type="button"
              className="av-icon-btn"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute sound' : 'Enable sound'}
              title={soundOn ? 'Mute' : 'Unmute'}
            >
              <Icon name={soundOn ? 'volume' : 'volumeOff'} size={18} />
            </button>
            <div className="av-balance">
              <div className="av-balance-icon">
                <Icon name="wallet" size={16} />
              </div>
              <div className="av-balance-text">
                <span>Wallet</span>
                <strong>{formatMoney(balance)}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="av-main">
        {/* ── History strip ─────────────────────────────────── */}
        <div className="av-history">
          <span className="av-history-label">
            <Icon name="history" size={15} /> History
          </span>
          <div className="av-history-list">
            {history.slice(-20).reverse().map((m, i) => (
              <span key={`${history.length - i}`} className={`av-chip av-chip-${tierOf(m)} ${i === 0 ? 'is-latest' : ''}`}>
                {m.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>

        <div className="av-grid">
          {/* ── Live feed ───────────────────────────────────── */}
          <aside className="av-feed">
            <div className="av-feed-head">
              <div className="av-seg">
                <button type="button" className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>All bets</button>
                <button type="button" className={tab === 'my' ? 'is-active' : ''} onClick={() => setTab('my')}>My bets</button>
              </div>
              <span className="av-online">
                <span className="av-online-dot" />
                {online.toLocaleString('en-IN')} online
              </span>
            </div>

            {tab === 'all' ? (
              <>
                <div className="av-feed-stats">
                  <div><span>Bets</span><strong>{totalBets}</strong></div>
                  <div><span>Staked</span><strong>{formatMoney(totalStake)}</strong></div>
                  <div><span>Won</span><strong className="is-green">{formatMoney(totalWon)}</strong></div>
                </div>
                <div className="av-feed-cols">
                  <span>Player</span><span>Bet</span><span>Mult.</span><span>Win</span>
                </div>
                <div className="av-feed-list">
                  {userRound.map((u) => (
                    <div key={`u${u.panel}`} className={`av-row is-you ${u.cashMult ? 'is-won' : ''} ${u.lost ? 'is-lost' : ''}`}>
                      <span className="av-row-user">
                        <span className="av-avatar is-you"><Icon name="user" size={12} strokeWidth={2.4} /></span>
                        You · {u.panel}
                      </span>
                      <span>{formatMoney(u.amount)}</span>
                      <span>{u.cashMult ? <em className={`av-mini av-chip-${tierOf(u.cashMult)}`}>{u.cashMult.toFixed(2)}x</em> : '—'}</span>
                      <span className="av-row-win">{u.cashMult ? formatMoney(u.amount * u.cashMult) : '—'}</span>
                    </div>
                  ))}
                  {bots.map((b) => (
                    <div key={b.id} className={`av-row ${b.cashMult ? 'is-won' : ''} ${b.lost ? 'is-lost' : ''}`}>
                      <span className="av-row-user">
                        <span className="av-avatar" style={{ background: AVATAR_COLORS[b.hue] }}>{b.name[0]}</span>
                        {b.name}
                      </span>
                      <span>{formatMoney(b.amount)}</span>
                      <span>{b.cashMult ? <em className={`av-mini av-chip-${tierOf(b.cashMult)}`}>{b.cashMult.toFixed(2)}x</em> : '—'}</span>
                      <span className="av-row-win">{b.cashMult ? formatMoney(b.amount * b.cashMult) : '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="av-feed-cols av-feed-cols-my">
                  <span>Time</span><span>Bet</span><span>Result</span><span>Win</span>
                </div>
                <div className="av-feed-list">
                  {myBets.length === 0 && (
                    <div className="av-empty">
                      <Icon name="inbox" size={28} strokeWidth={1.5} />
                      <p>No bets yet</p>
                      <span>Your bet history will appear here.</span>
                    </div>
                  )}
                  {myBets.map((m) => (
                    <div key={m.key} className={`av-row av-row-my ${m.cashMult ? 'is-won' : 'is-lost'}`}>
                      <span className="av-row-time">{timeOf(m.time)}</span>
                      <span>{formatMoney(m.amount)}</span>
                      <span>
                        {m.cashMult
                          ? <em className={`av-mini av-chip-${tierOf(m.cashMult)}`}>{m.cashMult.toFixed(2)}x</em>
                          : <em className="av-mini av-chip-lost">{m.crashAt.toFixed(2)}x</em>}
                      </span>
                      <span className="av-row-win">{m.cashMult ? formatMoney(m.win) : 'Lost'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* ── Stage + bet panels ──────────────────────────── */}
          <section className="av-play">
            <div className={`av-stage is-${phase}`} ref={stageRef}>
              <canvas ref={canvasRef} className="av-canvas" />

              {!ready && (
                <div className="av-connecting">
                  <span className="av-connecting-spinner" /> Connecting to game server…
                </div>
              )}

              <div className="av-stage-top">
                <button type="button" className="av-badge av-badge-fair" onClick={() => setFairOpen(true)}>
                  <Icon name="shieldCheck" size={14} /> Provably fair
                </button>
                <span className={`av-badge av-badge-state ${stateBadge.cls}`}>
                  <span className="av-badge-dot" /> {stateBadge.text}
                </span>
              </div>

              <div className="av-stage-center">
                {ready && phase === 'waiting' && (
                  <div className="av-wait">
                    <div className="av-ring">
                      <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={RING_R} className="av-ring-track" />
                        <circle
                          ref={ringRef}
                          cx="50"
                          cy="50"
                          r={RING_R}
                          className="av-ring-bar"
                          strokeDasharray={RING_C}
                          strokeDashoffset="0"
                        />
                      </svg>
                      <div className="av-ring-text">
                        <strong ref={countRef}>{(WAIT_MS / 1000).toFixed(1)}</strong>
                        <span>sec</span>
                      </div>
                    </div>
                    <div className="av-wait-title">Waiting for next round</div>
                    <div className="av-wait-sub">Place your bets before takeoff</div>
                  </div>
                )}

                {phase === 'flying' && (
                  <div className="av-flight">
                    <div className="av-mult" ref={multRef}>1.00x</div>
                    <div className="av-flight-sub">Cash out before it flies away</div>
                  </div>
                )}

                {phase === 'crashed' && (
                  <div className="av-flight is-crashed">
                    <div className="av-flew">Flew away!</div>
                    <div className="av-mult">{crashAt?.toFixed(2)}x</div>
                  </div>
                )}
              </div>

              <div className="av-stage-bottom">
                <span>Round #{round.id} · {shortHash(round.hash)}</span>
                <span className="av-alt">
                  <Icon name="trendingUp" size={13} /> ALT <b ref={altRef}>0 m</b>
                </span>
              </div>
            </div>

            {!rules.enabled && (
              <div className="av-paused">
                <Icon name="info" size={16} /> Aviator is paused by the operator. New bets are disabled; bets already in play are settled normally.
              </div>
            )}

            <div className="av-panels">
              {[1, 2].map((id) => (
                <BetPanel
                  key={id}
                  id={id}
                  accent={id === 1 ? '#ff2d55' : '#8b5cf6'}
                  phase={phase}
                  panel={panels[id]}
                  amount={amounts[id]}
                  onAmount={(v) => setAmounts((a) => ({ ...a, [id]: v }))}
                  auto={auto[id]}
                  onAuto={(next) => updateAuto(id, next)}
                  onAction={() => doAction(id)}
                  estimateRef={(el) => { estimateRefs.current[id] = el }}
                  hotkey={id === 1 ? 'Space' : null}
                  pending={pending[id]}
                  paused={!rules.enabled}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="av-footer">
        <span>&copy; 2026 Aviator · Balance shared across all games</span>
        <div className="av-footer-tags">
          <span><Icon name="shieldCheck" size={13} /> RNG verified</span>
          <span><Icon name="zap" size={13} /> Instant cash out</span>
          <span><Icon name="coins" size={13} /> Demo currency</span>
        </div>
      </footer>

      {/* ── Toasts ─────────────────────────────────────────── */}
      <div className="av-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`av-toast av-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>

      {/* ── Provably fair modal ────────────────────────────── */}
      {fairOpen && (
        <div className="av-modal-backdrop" onClick={() => setFairOpen(false)}>
          <div className="av-modal" role="dialog" aria-modal="true" aria-labelledby="av-fair-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="av-modal-close" onClick={() => setFairOpen(false)} aria-label="Close">
              <Icon name="x" size={18} />
            </button>
            <div className="av-modal-head">
              <div className="av-modal-icon"><Icon name="shieldCheck" size={22} /></div>
              <h3 id="av-fair-title">Provably fair system</h3>
            </div>
            <p className="av-modal-text">
              The server picks each round's crash point from a random seed before takeoff. Its SHA-256 hash is
              published up front and the seed is revealed after the crash, so you can verify the result was fixed in advance.
            </p>
            <div className="av-modal-box">
              <div>
                <label>Current round #{round.id} · hash</label>
                <code className="is-yellow">{round.hash || 'generating…'}</code>
              </div>
              {prevRound && (
                <div>
                  <label>Previous round #{prevRound.id} · seed (crashed at {prevRound.crashAt.toFixed(2)}x)</label>
                  <code>{prevRound.seed}</code>
                </div>
              )}
              <div>
                <label>This round's rules</label>
                <code>
                  House edge {rules.houseEdge}% (returns {Number((100 - rules.houseEdge).toFixed(2))}% on average) ·
                  instant crash {rules.instantCrash}% · max {rules.maxMultiplier}x
                </code>
              </div>
              <div>
                <label>Crash formula</label>
                <code>
                  r = seed[0..13] / 2^52 × 100 → r &lt; {rules.instantCrash} ? 1.00 : min({rules.maxMultiplier}, (100 − {rules.houseEdge}) / (100 − r))
                </code>
              </div>
            </div>
            <button type="button" className="av-modal-btn" onClick={() => setFairOpen(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
