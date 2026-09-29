import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createPlinkoBoard } from './plinkoBoard'
import { createPlinkoAudio } from './plinkoAudio'
import './Plinko.css'

const RISK_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }
const AUTO_MS = 550
const inr = (n) => Number(n).toLocaleString('en-IN')
const fmtMult = (m) => (m >= 100 ? `${inr(m)}` : String(m))

/** Edge buckets glow red, the centre is gold. */
function bucketColor(i, rows) {
  const d = Math.abs(i - rows / 2) / (rows / 2)
  const mix = (a, b) => Math.round(a + (b - a) * d)
  return `rgb(${mix(255, 255)}, ${mix(200, 48)}, ${mix(61, 92)})`
}

export default function Plinko() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [recent, setRecent] = useState([])
  const [amount, setAmount] = useState('10')
  const [rows, setRows] = useState(12)
  const [risk, setRisk] = useState('medium')
  const [flying, setFlying] = useState(0)
  const [hitBucket, setHitBucket] = useState(null) // { i, key } for the bounce animation
  const [auto, setAuto] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])
  const canvasRef = useRef(null)
  const board = useRef(null)
  const audio = useRef(null)
  const hidden = useRef(0) // winnings of balls still falling (not shown yet)
  const pending = useRef(new Map()) // ball id → bet
  const dropRef = useRef(null)

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/games/plinko/state').then(
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
    audio.current = createPlinkoAudio()
    return () => audio.current.dispose()
  }, [])

  // The board is created once the rules (and so the canvas) are on screen
  useEffect(() => {
    if (!rules || !canvasRef.current || board.current) return
    board.current = createPlinkoBoard(canvasRef.current, {
      onPeg: (row) => audio.current?.peg(row),
      onLand: (id) => {
        const bet = pending.current.get(id)
        pending.current.delete(id)
        if (!bet) return
        hidden.current -= bet.win
        if (bet.win) setBalance((b) => b + bet.win)
        setRecent((r) => [bet, ...r].slice(0, 30))
        setHitBucket({ i: bet.bucket, key: bet.id })
        setFlying((n) => n - 1)
        audio.current?.land(bet.multiplier)
      },
    })
    board.current.setRows(rows)
  }, [rules, rows, setBalance])

  useEffect(() => () => board.current?.destroy(), [])
  useEffect(() => { board.current?.setRows(rows) }, [rows])

  const stake = Number(amount) || 0

  const drop = async () => {
    audio.current.unlock()
    try {
      const d = await api.post('/games/plinko/drop', { amount: stake, rows, risk })
      hidden.current += d.bet.win
      setBalance(d.balance - hidden.current)
      setRules((r) => ({ ...r, tables: { ...r.tables, [rows]: { ...r.tables[rows], [risk]: d.table } } }))
      pending.current.set(d.bet.id, d.bet)
      setFlying((n) => n + 1)
      board.current.drop(d.bet.path, d.bet.bucket, d.bet.id)
      return true
    } catch (err) {
      toast('error', err.message)
      if (err.status === 403) setRules((r) => ({ ...r, enabled: false }))
      return false
    }
  }
  useEffect(() => { dropRef.current = drop })

  // Auto mode: keep dropping until switched off or a drop fails
  useEffect(() => {
    if (!auto) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      const ok = await dropRef.current()
      if (!ok) return setAuto(false)
      if (!stopped) timer = setTimeout(tick, AUTO_MS)
    }
    let timer = setTimeout(tick, 0)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [auto])

  const clampStake = (v) => (rules ? String(Math.round(Math.min(rules.maxBet, Math.max(rules.minBet, v)) * 100) / 100) : String(v))
  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  const table = rules?.tables[rows]?.[risk] ?? []
  const paused = rules && !rules.enabled
  const locked = flying > 0 || auto // board layout can't change mid-drop

  return (
    <div className="pk-root">
      <header className="pk-header">
        <button type="button" className="pk-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="pk-title">
          <span className="pk-logo"><Icon name="pyramid" size={16} strokeWidth={2.2} /></span>
          Plinko
        </div>
        <button type="button" className="pk-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="pk-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      <div className="pk-layout">
        <section className="pk-stage">
          <div className="pk-recent">
            {recent.length === 0 ? (
              <span className="pk-recent-empty">Drop a ball to start</span>
            ) : recent.slice(0, 14).map((b) => (
              <span key={b.id} className={`pk-chip ${b.multiplier >= 1 ? 'is-win' : ''}`} style={{ '--c': bucketColor(b.bucket, b.rows) }}>
                {fmtMult(b.multiplier)}×
              </span>
            ))}
          </div>

          {paused && <div className="pk-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Plinko is paused by the operator. New drops are disabled.</div>}

          {error && !rules ? (
            <div className="pk-board-msg"><Icon name="circleAlert" size={20} /> {error}</div>
          ) : !rules ? (
            <div className="pk-board-msg"><span className="pk-spinner" /></div>
          ) : (
            <div className="pk-board">
              <div className="pk-canvas-wrap">
                <canvas ref={canvasRef} className="pk-canvas" />
              </div>
              <div className="pk-buckets" style={{ '--rows': rows }}>
                {table.map((m, i) => (
                  <span
                    key={`${rows}-${i}-${hitBucket?.i === i ? hitBucket.key : ''}`}
                    className={`pk-bucket ${hitBucket?.i === i ? 'is-hit' : ''}`}
                    style={{ '--c': bucketColor(i, rows) }}
                  >
                    {fmtMult(m)}{rows <= 12 ? '×' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {rules && (
          <aside className="pk-panel">
            <div className="pk-field">
              <div className="pk-label"><span>Bet amount</span><em>{money(stake)}</em></div>
              <div className="pk-amount">
                <span>₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  disabled={auto}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(clampStake(stake))}
                  aria-label="Bet amount"
                />
                <button type="button" disabled={auto} onClick={() => setAmount(clampStake(stake / 2))}>½</button>
                <button type="button" disabled={auto} onClick={() => setAmount(clampStake(stake * 2))}>2×</button>
              </div>
              <div className="pk-quick">
                {[10, 50, 100, 500, 1000].filter((p) => p >= rules.minBet && p <= rules.maxBet).map((p) => (
                  <button type="button" key={p} disabled={auto} className={stake === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="pk-field">
              <div className="pk-label"><span>Risk</span><em>Top prize {fmtMult(Math.max(...table))}×</em></div>
              <div className="pk-seg">
                {rules.risks.map((r) => (
                  <button type="button" key={r} disabled={locked} className={risk === r ? 'is-active' : ''} onClick={() => setRisk(r)}>{RISK_LABELS[r]}</button>
                ))}
              </div>
            </div>

            <div className="pk-field">
              <div className="pk-label"><span>Rows</span><em>{rows + 1} buckets</em></div>
              <div className="pk-seg">
                {rules.rows.map((n) => (
                  <button type="button" key={n} disabled={locked} className={rows === n ? 'is-active' : ''} onClick={() => setRows(n)}>{n}</button>
                ))}
              </div>
            </div>

            <button type="button" className="pk-play" onClick={drop} disabled={auto || paused || stake > balance}>
              {stake > balance ? 'Not enough balance' : <>Drop ball <small>{money(stake)}</small></>}
            </button>
            <button
              type="button"
              className={`pk-auto ${auto ? 'is-on' : ''}`}
              onClick={() => setAuto((a) => !a)}
              disabled={!auto && (paused || stake > balance)}
            >
              <Icon name={auto ? 'x' : 'refresh'} size={15} strokeWidth={2.2} /> {auto ? 'Stop auto drop' : 'Auto drop'}
            </button>

            <p className="pk-note">
              <Icon name="info" size={13} /> Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · Max win ₹{inr(rules.maxWin)}{flying > 0 ? ` · ${flying} ball${flying > 1 ? 's' : ''} falling` : ''}
            </p>
          </aside>
        )}
      </div>

      <div className="pk-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`pk-toast pk-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
