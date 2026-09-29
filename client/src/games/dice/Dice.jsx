import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createDiceAudio } from './diceAudio'
import './Dice.css'

const ROLL_MS = 480
const inr = (n) => Number(n).toLocaleString('en-IN')
const r2 = (n) => Math.round(n * 100) / 100
const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100

export default function Dice() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [recent, setRecent] = useState([])
  const [amount, setAmount] = useState('100')
  const [direction, setDirection] = useState('over')
  const [target, setTarget] = useState(50)
  const [rolling, setRolling] = useState(false)
  const [last, setLast] = useState(null) // last settled roll, drives the marker + big number
  const [shown, setShown] = useState(null) // number displayed while it counts up
  const [edit, setEdit] = useState(null) // { field, text } while typing in multiplier / chance
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])
  const audio = useRef(null)

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/games/dice/state').then(
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
    audio.current = createDiceAudio()
    return () => audio.current.dispose()
  }, [])

  const chance = r2(direction === 'over' ? 100 - target : target)
  const payout = rules ? floor2((100 - rules.houseEdge) / chance) : 0
  const stake = Number(amount) || 0
  const profit = stake * payout - stake

  /** Keep the win chance inside the operator's limits. */
  const setChance = (c) => {
    if (!rules) return
    const cc = r2(Math.min(rules.maxChance, Math.max(rules.minChance, c)))
    setTarget(r2(direction === 'over' ? 100 - cc : cc))
  }

  const flip = () => {
    audio.current.click()
    setDirection((d) => (d === 'over' ? 'under' : 'over'))
    setTarget((t) => r2(100 - t)) // same chance, other side
  }

  const commitEdit = () => {
    if (!edit) return
    const v = Number(edit.text)
    if (Number.isFinite(v) && v > 0) {
      if (edit.field === 'chance') setChance(v)
      if (edit.field === 'payout') setChance((100 - rules.houseEdge) / v)
      if (edit.field === 'target') setChance(direction === 'over' ? 100 - v : v)
    }
    setEdit(null)
  }

  const roll = async () => {
    if (rolling) return
    audio.current.shake()
    setRolling(true)
    let d
    try {
      d = await api.post('/games/dice/roll', { amount: stake, direction, target })
    } catch (err) {
      toast('error', err.message)
      if (err.status === 403) setRules((r) => ({ ...r, enabled: false }))
      setRolling(false)
      return
    }
    // Stake leaves now; the win shows when the number lands
    setBalance(d.balance - d.bet.win)
    const start = performance.now()
    const from = last?.roll ?? 50
    const animate = (now) => {
      const t = Math.min(1, (now - start) / ROLL_MS)
      const e = 1 - (1 - t) ** 3
      setShown(from + (d.bet.roll - from) * e)
      if (t < 1) return requestAnimationFrame(animate)
      setShown(d.bet.roll)
      setLast(d.bet)
      setRolling(false)
      setRecent((r) => [d.bet, ...r].slice(0, 30))
      if (d.bet.win) setBalance((b) => b + d.bet.win)
      if (d.bet.won) audio.current.win()
      else audio.current.lose()
    }
    requestAnimationFrame(animate)
  }

  const clampStake = (v) => (rules ? String(Math.round(Math.min(rules.maxBet, Math.max(rules.minBet, v)) * 100) / 100) : String(v))
  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  const paused = rules && !rules.enabled
  const lo = rules ? (direction === 'over' ? 100 - rules.maxChance : rules.minChance) : 0
  const hi = rules ? (direction === 'over' ? 100 - rules.minChance : rules.maxChance) : 100
  const markerPos = shown ?? last?.roll ?? null
  const settled = last && !rolling
  const field = (name, value) => (edit?.field === name ? edit.text : value)

  return (
    <div className="dc-root">
      <header className="dc-header">
        <button type="button" className="dc-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="dc-title">
          <span className="dc-logo"><Icon name="dices" size={16} strokeWidth={2.2} /></span>
          Dice
        </div>
        <button type="button" className="dc-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="dc-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      <div className="dc-layout">
        <section className="dc-stage">
          <div className="dc-recent">
            {recent.length === 0 ? (
              <span className="dc-recent-empty">Your rolls will show here</span>
            ) : recent.slice(0, 14).map((b) => (
              <span key={b.id} className={`dc-chip ${b.won ? 'is-win' : ''}`}>{b.roll.toFixed(2)}</span>
            ))}
          </div>

          {paused && <div className="dc-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Dice is paused by the operator. New rolls are disabled.</div>}

          {error && !rules ? (
            <div className="dc-board-msg"><Icon name="circleAlert" size={20} /> {error}</div>
          ) : !rules ? (
            <div className="dc-board-msg"><span className="dc-spinner" /></div>
          ) : (
            <div className="dc-board">
              {/* Big number */}
              <div className={`dc-result ${settled ? (last.won ? 'is-win' : 'is-loss') : ''} ${rolling ? 'is-rolling' : ''}`}>
                <strong>{markerPos == null ? '––.––' : markerPos.toFixed(2)}</strong>
                <span>
                  {settled
                    ? last.won ? `You won ${money(last.win)}` : `Needed ${last.direction === 'over' ? '≥' : '<'} ${last.target.toFixed(2)}`
                    : rolling ? 'Rolling…' : `Roll ${direction === 'over' ? 'over' : 'under'} ${target.toFixed(2)} to win`}
                </span>
              </div>

              {/* Slider */}
              <div className="dc-track-wrap">
                {markerPos != null && (
                  <div className={`dc-marker ${settled ? (last.won ? 'is-win' : 'is-loss') : ''}`} style={{ '--p': markerPos / 100 }}>
                    <span>{markerPos.toFixed(2)}</span>
                  </div>
                )}
                <div
                  className={`dc-track is-${direction}`}
                  style={{ '--t': `${target}%` }}
                >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={target}
                    disabled={rolling}
                    onChange={(e) => {
                      const v = Math.min(hi, Math.max(lo, Number(e.target.value)))
                      if (v !== target) audio.current.tick()
                      setTarget(r2(v))
                    }}
                    aria-label="Target"
                  />
                </div>
                <div className="dc-scale">
                  {[0, 25, 50, 75, 100].map((n) => <span key={n} style={{ left: `${n}%` }}>{n}</span>)}
                </div>
              </div>

              {/* Payout / target / chance */}
              <div className="dc-controls">
                <label className="dc-box">
                  <span>Multiplier</span>
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      value={field('payout', payout.toFixed(2))}
                      onFocus={() => setEdit({ field: 'payout', text: payout.toFixed(2) })}
                      onChange={(e) => setEdit({ field: 'payout', text: e.target.value })}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      disabled={rolling}
                    />
                    <em>×</em>
                  </div>
                </label>
                <button type="button" className="dc-box dc-flip" onClick={flip} disabled={rolling} title="Switch between over and under">
                  <span>Roll {direction === 'over' ? 'over' : 'under'}</span>
                  <div>
                    <strong>{target.toFixed(2)}</strong>
                    <Icon name="arrowUpDown" size={15} strokeWidth={2.2} />
                  </div>
                </button>
                <label className="dc-box">
                  <span>Win chance</span>
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      value={field('chance', chance.toFixed(2))}
                      onFocus={() => setEdit({ field: 'chance', text: chance.toFixed(2) })}
                      onChange={(e) => setEdit({ field: 'chance', text: e.target.value })}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      disabled={rolling}
                    />
                    <em>%</em>
                  </div>
                </label>
              </div>
            </div>
          )}
        </section>

        {rules && (
          <aside className="dc-panel">
            <div className="dc-field">
              <div className="dc-label"><span>Bet amount</span><em>{money(stake)}</em></div>
              <div className="dc-amount">
                <span>₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(clampStake(stake))}
                  aria-label="Bet amount"
                />
                <button type="button" onClick={() => setAmount(clampStake(stake / 2))}>½</button>
                <button type="button" onClick={() => setAmount(clampStake(stake * 2))}>2×</button>
              </div>
              <div className="dc-quick">
                {[10, 50, 100, 500, 1000].filter((p) => p >= rules.minBet && p <= rules.maxBet).map((p) => (
                  <button type="button" key={p} className={stake === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="dc-field">
              <div className="dc-label"><span>Direction</span></div>
              <div className="dc-seg">
                <button type="button" disabled={rolling} className={direction === 'under' ? 'is-active' : ''} onClick={() => direction !== 'under' && flip()}>Roll under</button>
                <button type="button" disabled={rolling} className={direction === 'over' ? 'is-active' : ''} onClick={() => direction !== 'over' && flip()}>Roll over</button>
              </div>
            </div>

            <div className="dc-profit">
              <span>Profit on win</span>
              <strong>+{money(Math.max(0, profit))}</strong>
            </div>

            <button type="button" className="dc-play" onClick={roll} disabled={rolling || paused || stake > balance}>
              {stake > balance ? 'Not enough balance' : rolling ? 'Rolling…' : <><Icon name="dices" size={18} strokeWidth={2.2} /> Roll dice</>}
            </button>

            <p className="dc-note">
              <Icon name="info" size={13} /> Win chance {rules.minChance}–{rules.maxChance}% · Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · House edge {rules.houseEdge}%
            </p>
          </aside>
        )}
      </div>

      <div className="dc-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`dc-toast dc-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
