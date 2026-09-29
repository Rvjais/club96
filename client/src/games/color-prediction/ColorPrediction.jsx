import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { COLORS, LOCK_MS, ROUND_MS, createColorEngine, getInitialSnapshot } from './colorEngine'
import { subscribe } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import './ColorPrediction.css'

const PRESETS = [10, 100, 1000, 10000]
const RING_R = 42
const RING_C = 2 * Math.PI * RING_R

const formatMoney = (n) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatPreset = (n) => (n >= 1000 ? `${n / 1000}k` : String(n))

export default function ColorPrediction() {
  const navigate = useNavigate()
  const { setBalance, refresh } = useAuth()
  const [snap, setSnap] = useState(getInitialSnapshot)
  const [placing, setPlacing] = useState(false)
  const [sheetColor, setSheetColor] = useState(null)
  const [amount, setAmount] = useState('100')
  const [tab, setTab] = useState('results')
  const [result, setResult] = useState(null)
  const [toasts, setToasts] = useState([])
  const engineRef = useRef(null)

  const pushToast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500)
  }, [])

  useEffect(() => {
    let resultTimer = 0
    const engine = createColorEngine({
      onState: (next) => {
        setSnap(next)
        setBalance(next.balance)
      },
      onEvent: (e) => {
        if (e.type === 'locked') setSheetColor(null)
        if (e.type === 'result') {
          setResult(e)
          clearTimeout(resultTimer)
          resultTimer = setTimeout(() => setResult(null), 2800)
        }
      },
    })
    engineRef.current = engine
    engine.start()

    let lastCheck = 0
    const unsubscribe = subscribe('/games/color/stream', engine.sync, () => {
      if (Date.now() - lastCheck < 5000) return
      lastCheck = Date.now()
      refresh().catch(() => {})
    })

    return () => {
      unsubscribe()
      engine.stop()
      clearTimeout(resultTimer)
    }
  }, [setBalance, refresh])

  // Escape closes the bet sheet
  useEffect(() => {
    if (!sheetColor) return
    const onKey = (e) => e.key === 'Escape' && setSheetColor(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetColor])

  const { ready, phase, period, timeLeft, balance, history, bets, records, rules } = snap
  const paused = !rules.enabled
  const locked = phase !== 'open' || paused
  const MIN_BET = rules.minBet
  const pctText = (n) => `${Number(n.toFixed(2))}%`
  const seconds = Math.ceil(timeLeft / 1000)
  const value = Math.floor(Number(amount)) || 0

  const openSheet = (color) => {
    if (!ready) return
    if (paused) return pushToast('error', 'Color Prediction is paused. Please try again later.')
    if (locked) return pushToast('error', 'Betting is closed for this period')
    setAmount('100')
    setSheetColor(color)
  }

  const step = (dir) => {
    const size = value >= 1000 ? 1000 : value >= 100 ? 100 : 10
    setAmount(String(Math.max(MIN_BET, value + dir * size)))
  }

  const confirmBet = async () => {
    if (!engineRef.current || placing) return
    const color = sheetColor
    setPlacing(true)
    const res = await engineRef.current.placeBet(color, amount)
    setPlacing(false)
    if (!res.ok) return pushToast('error', res.error)
    pushToast('success', `Placed ${formatMoney(res.amount)} on ${COLORS[color].label}`)
    setSheetColor(null)
  }

  const statusBadge =
    phase === 'open'
      ? { cls: 'is-open', icon: 'circleCheck', text: 'Open' }
      : phase === 'locked'
        ? { cls: 'is-locked', icon: 'lock', text: 'Locked' }
        : { cls: 'is-settling', icon: 'timer', text: 'Drawing' }

  const ringOffset = RING_C * (1 - timeLeft / ROUND_MS)
  const totalStaked = bets.reduce((t, b) => t + b.amount, 0)

  return (
    <div className="cp-root">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="cp-header">
        <button type="button" className="cp-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="cp-title">
          <span className="cp-title-dots"><i className="red" /><i className="violet" /><i className="green" /></span>
          Color Prediction
        </div>
        <div className="cp-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{formatMoney(balance)}</strong>
        </div>
      </header>

      <main className="cp-main">
        {/* ── Timer card ───────────────────────────────────── */}
        <section className={`cp-timer ${phase === 'locked' ? 'is-locked' : ''}`}>
          <div className="cp-timer-info">
            <span className="cp-timer-label"><Icon name="hash" size={12} strokeWidth={2.4} /> Period</span>
            <strong className="cp-period">{ready ? period : 'Connecting…'}</strong>
            <span className={`cp-status ${statusBadge.cls}`}>
              <Icon name={statusBadge.icon} size={12} strokeWidth={2.4} /> {statusBadge.text}
            </span>
          </div>
          <div className="cp-ring">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={RING_R} className="cp-ring-track" />
              <circle
                cx="50"
                cy="50"
                r={RING_R}
                className="cp-ring-bar"
                strokeDasharray={RING_C}
                strokeDashoffset={ringOffset}
              />
            </svg>
            <div className="cp-ring-text">
              <strong>{ready ? `00:${String(seconds).padStart(2, '0')}` : '--:--'}</strong>
              <span>{phase === 'open' ? 'to lock' : phase === 'locked' ? 'locked' : 'drawing'}</span>
            </div>
          </div>
        </section>

        {paused && (
          <div className="cp-lock-note cp-paused-note">
            <Icon name="lock" size={14} strokeWidth={2.2} /> This game is paused by the operator. Bets already placed will still be settled.
          </div>
        )}

        {!paused && phase === 'locked' && (
          <div className="cp-lock-note">
            <Icon name="lock" size={14} strokeWidth={2.2} /> Bets close {LOCK_MS / 1000}s before the draw. Next period opens shortly.
          </div>
        )}

        {/* ── Colour buttons ───────────────────────────────── */}
        <section className="cp-colors">
          {Object.entries(COLORS).map(([key, c]) => (
            <button
              type="button"
              key={key}
              className={`cp-color cp-color-${key} ${locked || !ready ? 'is-disabled' : ''}`}
              onClick={() => openSheet(key)}
              aria-disabled={locked}
            >
              <span className="cp-color-orb" />
              <span className="cp-color-name">{c.label}</span>
              <span className="cp-color-mult">{rules.multipliers[key]}×</span>
              <span className="cp-color-chance">{pctText(rules.chances[key])} chance</span>
              {locked && (
                <span className="cp-color-lock"><Icon name="lock" size={16} strokeWidth={2.2} /></span>
              )}
            </button>
          ))}
        </section>

        {/* ── Current round bets ───────────────────────────── */}
        <section className="cp-card">
          <div className="cp-card-head">
            <h2>Current round bets</h2>
            <span className="cp-count">{bets.length}</span>
          </div>
          {bets.length === 0 ? (
            <p className="cp-empty-line">No bets for this period yet. Pick a colour above to play.</p>
          ) : (
            <>
              <div className="cp-bet-list">
                {[...bets].reverse().map((b) => (
                  <div key={b.id} className="cp-bet-row">
                    <span className="cp-bet-color">
                      <i className={`cp-swatch ${b.color}`} />
                      {COLORS[b.color].label}
                      <em>{b.multiplier}×</em>
                    </span>
                    <strong>{formatMoney(b.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="cp-bet-total">
                <span>Total staked</span>
                <strong>{formatMoney(totalStaked)}</strong>
              </div>
            </>
          )}
        </section>

        {/* ── Results / My bets ────────────────────────────── */}
        <section className="cp-card">
          <div className="cp-tabs">
            <button type="button" className={tab === 'results' ? 'is-active' : ''} onClick={() => setTab('results')}>
              <Icon name="history" size={15} /> Results
            </button>
            <button type="button" className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}>
              <Icon name="user" size={15} /> My bets
            </button>
          </div>

          {tab === 'results' ? (
            <>
              <div className="cp-dots">
                {history.slice(-10).map((h) => (
                  <span key={h.period} className={`cp-dot ${h.color}`} title={`${h.period}: ${COLORS[h.color].label}`}>
                    {COLORS[h.color].label[0]}
                  </span>
                ))}
              </div>
              <div className="cp-table">
                <div className="cp-table-head"><span>Period</span><span>Result</span></div>
                {history.slice(-8).reverse().map((h) => (
                  <div key={h.period} className="cp-table-row">
                    <span className="cp-mono">{h.period}</span>
                    <span className="cp-result-cell"><i className={`cp-swatch ${h.color}`} /> {COLORS[h.color].label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : records.length === 0 ? (
            <div className="cp-empty">
              <Icon name="inbox" size={28} strokeWidth={1.5} />
              <p>No settled bets yet</p>
              <span>Your results will appear here after each draw.</span>
            </div>
          ) : (
            <div className="cp-table">
              <div className="cp-table-head cp-cols-4"><span>Period</span><span>Pick</span><span>Bet</span><span>Result</span></div>
              {records.map((r) => (
                <div key={r.id} className={`cp-table-row cp-cols-4 ${r.win > 0 ? 'is-won' : 'is-lost'}`}>
                  <span className="cp-mono">{r.period.slice(-5)}</span>
                  <span className="cp-result-cell"><i className={`cp-swatch ${r.color}`} /> {COLORS[r.color].label}</span>
                  <span>{formatMoney(r.amount)}</span>
                  <span className="cp-win">{r.win > 0 ? `+${formatMoney(r.win)}` : 'Lost'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="cp-note">
          <Icon name="info" size={13} /> Uses your shared wallet. Bets ₹{MIN_BET.toLocaleString('en-IN')}–₹{rules.maxBet.toLocaleString('en-IN')}. Payouts are fixed when you place a bet.
        </p>
      </main>

      {/* ── Bet sheet ──────────────────────────────────────── */}
      <div className={`cp-sheet-overlay ${sheetColor ? 'is-open' : ''}`} aria-hidden={!sheetColor}>
        <div className="cp-sheet-backdrop" onClick={() => setSheetColor(null)} />
        <div className="cp-sheet" role="dialog" aria-modal="true" aria-label="Place bet">
          <div className="cp-sheet-handle" />
          {sheetColor && (
            <>
              <div className={`cp-sheet-head cp-head-${sheetColor}`}>
                <span className="cp-sheet-title">
                  <i className={`cp-swatch ${sheetColor}`} /> Bet on {COLORS[sheetColor].label}
                  <em>{rules.multipliers[sheetColor]}×</em>
                </span>
                <button type="button" className="cp-sheet-close" onClick={() => setSheetColor(null)} aria-label="Close">
                  <Icon name="x" size={16} strokeWidth={2.4} />
                </button>
              </div>

              <label className="cp-sheet-label">Amount</label>
              <div className="cp-presets">
                {PRESETS.map((p) => (
                  <button type="button" key={p} className={value === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    ₹{formatPreset(p)}
                  </button>
                ))}
              </div>

              <div className="cp-stepper">
                <button type="button" onClick={() => step(-1)} aria-label="Decrease">
                  <Icon name="minus" size={16} strokeWidth={2.4} />
                </button>
                <div className="cp-stepper-field">
                  <span>₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_BET}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Bet amount"
                  />
                </div>
                <button type="button" onClick={() => step(1)} aria-label="Increase">
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                </button>
              </div>

              <div className="cp-sheet-summary">
                <div>
                  <span>Potential win</span>
                  <strong>{formatMoney(value * rules.multipliers[sheetColor])}</strong>
                </div>
                <div>
                  <span>Balance after</span>
                  <strong className={value > balance ? 'is-bad' : ''}>{formatMoney(Math.max(0, balance - value))}</strong>
                </div>
              </div>

              <button type="button" className={`cp-confirm cp-confirm-${sheetColor}`} onClick={confirmBet} disabled={placing}>
                {placing ? 'Placing…' : `Confirm ${formatMoney(value)}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Result banner ──────────────────────────────────── */}
      <div className={`cp-result ${result ? 'is-shown' : ''}`} aria-live="polite">
        {result && (
          <>
            <span className={`cp-result-icon ${!result.played ? 'is-neutral' : result.winnings > 0 ? 'is-won' : 'is-lost'}`}>
              <Icon name={!result.played ? 'history' : result.winnings > 0 ? 'trophy' : 'x'} size={18} strokeWidth={2.2} />
            </span>
            <div className="cp-result-body">
              <div className="cp-result-top">
                <strong>{!result.played ? 'Period settled' : result.winnings > 0 ? 'You won!' : 'No hit this time'}</strong>
                <span className={`cp-result-tag ${result.color}`}>{COLORS[result.color].label}</span>
              </div>
              <span className={`cp-result-sub ${result.winnings > 0 ? 'is-won' : ''}`}>
                {!result.played
                  ? `Period ${result.period.slice(-5)}`
                  : result.winnings > 0
                    ? `+${formatMoney(result.winnings)}`
                    : `-${formatMoney(result.staked)}`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Toasts ─────────────────────────────────────────── */}
      <div className="cp-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`cp-toast cp-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
