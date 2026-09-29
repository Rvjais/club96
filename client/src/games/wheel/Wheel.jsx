import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createWheelAudio } from './wheelAudio'
import './Wheel.css'

const SPIN_MS = 4200
const RISK_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }
// Paying segments get brighter colours as the multiplier grows; 0× stays slate
const PALETTE = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#eab308']
const ZERO = '#2a3350'
const inr = (n) => Number(n).toLocaleString('en-IN')
const ease = (t) => 1 - (1 - t) ** 3.2 // close to the CSS curve below, used for tick sounds

function colorMap(layout) {
  const paying = [...new Set(layout.filter((m) => m > 0))].sort((a, b) => a - b)
  return (m) => (m > 0 ? PALETTE[paying.indexOf(m) % PALETTE.length] : ZERO)
}

/** SVG path for one ring segment, angles in degrees clockwise from 12 o'clock. */
function arc(a0, a1, r0, r1) {
  const p = (a, r) => {
    const rad = ((a - 90) * Math.PI) / 180
    return `${(100 + r * Math.cos(rad)).toFixed(3)} ${(100 + r * Math.sin(rad)).toFixed(3)}`
  }
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${p(a0, r1)} A ${r1} ${r1} 0 ${large} 1 ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`
}

export default function Wheel() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [recent, setRecent] = useState([])
  const [amount, setAmount] = useState('100')
  const [risk, setRisk] = useState('medium')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null) // last settled spin
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])
  const audio = useRef(null)
  const timers = useRef([])

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/games/wheel/state').then(
      (d) => {
        if (cancelled) return
        setRules(d.rules)
        setRecent(d.recent)
        setBalance(d.balance)
      },
      (err) => !cancelled && setError(err.message),
    )
    return () => { cancelled = true }
  }, [setBalance])

  useEffect(() => {
    audio.current = createWheelAudio()
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      audio.current.dispose()
    }
  }, [])

  const layout = rules?.layouts[risk] ?? []
  const n = layout.length || 1
  const seg = 360 / n
  const colorOf = colorMap(layout)
  const stake = Number(amount) || 0

  // Legend: each distinct multiplier with its chance
  const legend = [...new Set(layout)].sort((a, b) => a - b).map((m) => ({
    m,
    chance: (layout.filter((x) => x === m).length / n) * 100,
  }))

  const spin = async () => {
    if (spinning) return
    audio.current.click()
    setSpinning(true)
    setResult(null)
    let d
    try {
      d = await api.post('/games/wheel/spin', { amount: stake, risk })
    } catch (err) {
      toast('error', err.message)
      if (err.status === 403) setRules((r) => ({ ...r, enabled: false }))
      setSpinning(false)
      return
    }
    setBalance(d.balance - d.bet.win) // win is shown when the wheel stops
    setRules((r) => ({ ...r, layouts: { ...r.layouts, [risk]: d.layout } }))

    // Land the middle of the winning segment (± a little) under the pointer
    const segDeg = 360 / d.layout.length
    const jitter = (Math.random() - 0.5) * segDeg * 0.6
    const target = 360 - (d.bet.index + 0.5) * segDeg + jitter
    const from = rotation
    const delta = 360 * 6 + ((((target - from) % 360) + 360) % 360)
    setRotation(from + delta)

    // Tick each time a segment boundary passes the pointer
    const start = performance.now()
    let lastSeg = Math.floor(from / segDeg)
    const tick = (now) => {
      const t = Math.min(1, (now - start) / SPIN_MS)
      const s = Math.floor((from + delta * ease(t)) / segDeg)
      if (s !== lastSeg) {
        lastSeg = s
        audio.current.tick()
      }
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    timers.current.push(setTimeout(() => {
      setSpinning(false)
      setResult(d.bet)
      setRecent((r) => [d.bet, ...r].slice(0, 30))
      if (d.bet.win) setBalance((b) => b + d.bet.win)
      if (d.bet.multiplier >= 1) {
        audio.current.win(d.bet.multiplier)
        if (d.bet.multiplier >= 3) toast('success', `${d.bet.multiplier}× — won ${money(d.bet.win)}!`)
      } else {
        audio.current.lose()
      }
    }, SPIN_MS + 80))
  }

  const clampStake = (v) => (rules ? String(Math.round(Math.min(rules.maxBet, Math.max(rules.minBet, v)) * 100) / 100) : String(v))
  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  const paused = rules && !rules.enabled
  const topPrize = layout.length ? Math.max(...layout) : 0

  return (
    <div className="wh-root">
      <header className="wh-header">
        <button type="button" className="wh-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="wh-title">
          <span className="wh-logo"><Icon name="wheel" size={16} strokeWidth={2} /></span>
          Wheel
        </div>
        <button type="button" className="wh-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="wh-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      <div className="wh-layout">
        <section className="wh-stage">
          <div className="wh-recent">
            {recent.length === 0 ? (
              <span className="wh-recent-empty">Your spins will show here</span>
            ) : recent.slice(0, 14).map((b) => (
              <span key={b.id} className={`wh-chip ${b.multiplier > 0 ? 'is-win' : ''}`}>{b.multiplier.toFixed(2)}×</span>
            ))}
          </div>

          {paused && <div className="wh-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Wheel is paused by the operator. New spins are disabled.</div>}

          {error && !rules ? (
            <div className="wh-board-msg"><Icon name="circleAlert" size={20} /> {error}</div>
          ) : !rules ? (
            <div className="wh-board-msg"><span className="wh-spinner" /></div>
          ) : (
            <div className="wh-board">
              <div className={`wh-wheel ${result ? (result.multiplier > 0 ? 'is-win' : 'is-loss') : ''}`}>
                <div className="wh-pointer" />
                <svg viewBox="0 0 200 200" className="wh-svg" aria-hidden="true">
                  <circle cx="100" cy="100" r="98" className="wh-rim" />
                  <g className={`wh-disc ${spinning ? 'is-spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)` }}>
                    {layout.map((m, i) => (
                      <path
                        key={i}
                        d={arc(i * seg, (i + 1) * seg, 64, 92)}
                        fill={colorOf(m)}
                        className={result && !spinning && result.index === i ? 'is-hit' : ''}
                        stroke="#0c0a1a"
                        strokeWidth="1.2"
                      />
                    ))}
                    {layout.map((_, i) => {
                      const a = (((i + 0.5) * seg - 90) * Math.PI) / 180
                      return <circle key={`d${i}`} cx={100 + 95 * Math.cos(a)} cy={100 + 95 * Math.sin(a)} r="1.4" fill="#ffe7a3" opacity="0.8" />
                    })}
                  </g>
                  <circle cx="100" cy="100" r="62" className="wh-hub-ring" />
                </svg>
                <div className="wh-hub">
                  {result && !spinning ? (
                    <>
                      <strong style={{ color: result.multiplier > 0 ? colorOf(result.multiplier) : undefined }}>{result.multiplier.toFixed(2)}×</strong>
                      <span>{result.win > 0 ? `+${money(result.win)}` : 'No win'}</span>
                    </>
                  ) : (
                    <>
                      <strong className="wh-hub-idle">{spinning ? '…' : `${topPrize}×`}</strong>
                      <span>{spinning ? 'Spinning' : 'Top prize'}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="wh-legend">
                {legend.map(({ m, chance }) => (
                  <div key={m} className={`wh-legend-item ${result && !spinning && result.multiplier === m ? 'is-hit' : ''}`} style={{ '--c': colorOf(m) }}>
                    <strong>{m.toFixed(2)}×</strong>
                    <span>{Number(chance.toFixed(2))}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {rules && (
          <aside className="wh-panel">
            <div className="wh-field">
              <div className="wh-label"><span>Bet amount</span><em>{money(stake)}</em></div>
              <div className="wh-amount">
                <span>₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  disabled={spinning}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(clampStake(stake))}
                  aria-label="Bet amount"
                />
                <button type="button" disabled={spinning} onClick={() => setAmount(clampStake(stake / 2))}>½</button>
                <button type="button" disabled={spinning} onClick={() => setAmount(clampStake(stake * 2))}>2×</button>
              </div>
              <div className="wh-quick">
                {[10, 50, 100, 500, 1000].filter((p) => p >= rules.minBet && p <= rules.maxBet).map((p) => (
                  <button type="button" key={p} disabled={spinning} className={stake === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="wh-field">
              <div className="wh-label"><span>Risk</span><em>{n} segments</em></div>
              <div className="wh-seg">
                {rules.risks.map((r) => (
                  <button type="button" key={r} disabled={spinning} className={risk === r ? 'is-active' : ''} onClick={() => { setRisk(r); setResult(null) }}>
                    {RISK_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="wh-play" onClick={spin} disabled={spinning || paused || stake > balance}>
              {stake > balance ? 'Not enough balance' : spinning ? 'Spinning…' : <>Spin <small>{money(stake)}</small></>}
            </button>

            <p className="wh-note">
              <Icon name="info" size={13} /> Every segment is equally likely · Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · Max win ₹{inr(rules.maxWin)}
            </p>
          </aside>
        )}
      </div>

      <div className="wh-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`wh-toast wh-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
