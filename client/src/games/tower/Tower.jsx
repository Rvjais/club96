import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createTowerAudio } from './towerAudio'
import './Tower.css'

const MODES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'expert', label: 'Expert' },
]
const inr = (n) => Number(n).toLocaleString('en-IN')
const randomCol = (tiles) => Math.floor(Math.random() * tiles)
const fmtMult = (m) => (m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}×` : `${m.toFixed(2)}×`)

export default function Tower() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [active, setActive] = useState(null)
  const [finished, setFinished] = useState(null)
  const [recent, setRecent] = useState([])
  const [amount, setAmount] = useState('100')
  const [mode, setMode] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])
  const audio = useRef(null)

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const apply = useCallback((d) => {
    setRules(d.rules)
    setActive(d.active)
    setRecent(d.recent)
    setBalance(d.balance)
    if (d.active) setMode(d.active.mode)
  }, [setBalance])

  const load = useCallback(
    () => api.get('/games/tower/state').then(apply, (err) => setError(err.message)),
    [apply],
  )

  useEffect(() => {
    audio.current = createTowerAudio()
    load()
    return () => audio.current.dispose()
  }, [load])

  const call = async (action, body) => {
    setBusy(true)
    try {
      const d = await api.post(`/games/tower/${action}`, body)
      setBalance(d.balance)
      return d
    } catch (err) {
      toast('error', err.message)
      if ([403, 404, 409].includes(err.status)) load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const settle = (bet) => {
    setActive(null)
    setFinished(bet)
    setRecent((r) => [bet, ...r].slice(0, 20))
    if (bet.status === 'won') {
      audio.current.cashout()
      toast('success', `Cashed out ${money(bet.win)} at ${bet.multiplier.toFixed(2)}×`)
    } else {
      audio.current.trap()
    }
  }

  const round = active ?? finished
  const curMode = round?.mode ?? mode
  const modeInfo = rules?.modes[curMode]
  const levels = round?.levels ?? rules?.levels ?? 8
  const ladder = rules?.modes[curMode]?.ladder ?? []
  const stake = Number(amount) || 0
  const picks = round?.picks ?? []

  const start = async () => {
    if (busy) return
    audio.current.click()
    const d = await call('start', { amount: stake, mode })
    if (!d) return
    setFinished(null)
    setActive(d.bet)
  }

  const step = async (col) => {
    if (!active || busy) return
    const d = await call('step', { col })
    if (!d) return
    if (d.bet.status === 'active') {
      setActive(d.bet)
      audio.current.step(d.bet.picks.length)
    } else {
      settle(d.bet)
    }
  }

  const cashout = async () => {
    if (!active || busy || active.picks.length === 0) return
    const d = await call('cashout')
    if (d) settle(d.bet)
  }

  const clampStake = (v) => (rules ? String(Math.round(Math.min(rules.maxBet, Math.max(rules.minBet, v)) * 100) / 100) : String(v))
  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  /** What to draw for tile `col` on `level` (0 = bottom). */
  const cellState = (level, col) => {
    if (!round) return 'idle'
    const picked = picks[level] === col
    if (round.status === 'active') {
      if (level < picks.length) return picked ? 'safe' : 'past'
      return level === picks.length ? 'open' : 'idle'
    }
    const safe = round.board?.[level]?.includes(col)
    if (picked) return safe ? 'safe' : 'trap'
    return safe ? 'safe-dim' : 'trap-dim'
  }

  const cashValue = active ? active.amount * active.multiplier : 0
  const paused = rules && !rules.enabled
  const tiles = modeInfo?.tiles ?? 3

  return (
    <div className="tw-root">
      <header className="tw-header">
        <button type="button" className="tw-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="tw-title">
          <span className="tw-logo"><Icon name="layers" size={16} strokeWidth={2.2} /></span>
          Tower
        </div>
        <button type="button" className="tw-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="tw-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      <div className="tw-layout">
        <section className="tw-stage">
          <div className="tw-recent">
            {recent.length === 0 ? (
              <span className="tw-recent-empty">Your last climbs will show here</span>
            ) : recent.slice(0, 12).map((b) => (
              <span key={b.id} className={`tw-chip ${b.status === 'won' ? 'is-win' : ''}`}>
                {b.status === 'won' ? `${b.multiplier.toFixed(2)}×` : `L${b.picks.length}`}
              </span>
            ))}
          </div>

          {paused && <div className="tw-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Tower is paused by the operator. New climbs are disabled.</div>}

          <div className="tw-board">
            {error && !rules ? (
              <div className="tw-board-msg"><Icon name="circleAlert" size={20} /> {error}</div>
            ) : !rules ? (
              <div className="tw-board-msg"><span className="tw-spinner" /></div>
            ) : (
              <div className={`tw-tower ${active ? 'is-live' : ''}`} style={{ '--tiles': tiles }}>
                <div className="tw-flag"><Icon name="crown" size={18} strokeWidth={2} fill="rgba(255, 213, 79, 0.35)" /></div>
                {Array.from({ length: levels }, (_, i) => levels - 1 - i).map((level) => {
                  const isCurrent = active && level === picks.length
                  const cleared = round && level < picks.length && round.status !== 'lost'
                  return (
                    <div key={level} className={`tw-row ${isCurrent ? 'is-current' : ''} ${cleared ? 'is-cleared' : ''}`}>
                      <span className="tw-level">{level + 1}</span>
                      <div className="tw-cells">
                        {Array.from({ length: tiles }, (_, col) => {
                          const st = cellState(level, col)
                          return (
                            <button
                              type="button"
                              key={col}
                              className={`tw-cell is-${st}`}
                              disabled={st !== 'open' || busy}
                              onClick={() => step(col)}
                              aria-label={st === 'open' ? `Level ${level + 1}, tile ${col + 1}` : undefined}
                            >
                              {st.startsWith('safe') && <Icon name="gem" size={20} strokeWidth={1.8} fill="rgba(52, 211, 153, 0.3)" />}
                              {st.startsWith('trap') && <Icon name="x" size={20} strokeWidth={2.6} />}
                              {st === 'open' && <span className="tw-cell-mult">{fmtMult(ladder[level])}</span>}
                            </button>
                          )
                        })}
                      </div>
                      <span className="tw-mult">{ladder[level] != null ? fmtMult(ladder[level]) : ''}</span>
                    </div>
                  )
                })}
                <div className="tw-base" />
              </div>
            )}

            {finished && (
              <div key={finished.id} className={`tw-outcome ${finished.status === 'won' ? '' : 'is-loss'}`}>
                <strong>{finished.status === 'won' ? `${finished.multiplier.toFixed(2)}×` : 'Trapped!'}</strong>
                <span>{finished.status === 'won' ? `+${money(finished.win)}` : `Fell on level ${finished.picks.length}`}</span>
              </div>
            )}
          </div>
        </section>

        {rules && (
          <aside className="tw-panel">
            <div className="tw-field">
              <div className="tw-label"><span>Bet amount</span><em>{money(stake)}</em></div>
              <div className="tw-amount">
                <span>₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  disabled={!!active}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(clampStake(stake))}
                  aria-label="Bet amount"
                />
                <button type="button" disabled={!!active} onClick={() => setAmount(clampStake(stake / 2))}>½</button>
                <button type="button" disabled={!!active} onClick={() => setAmount(clampStake(stake * 2))}>2×</button>
              </div>
              <div className="tw-quick">
                {[10, 50, 100, 500, 1000].filter((p) => p >= rules.minBet && p <= rules.maxBet).map((p) => (
                  <button type="button" key={p} disabled={!!active} className={stake === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="tw-field">
              <div className="tw-label"><span>Difficulty</span><em>{modeInfo ? `${modeInfo.safe} of ${modeInfo.tiles} tiles safe` : ''}</em></div>
              <div className="tw-modes">
                {MODES.map((m) => (
                  <button
                    type="button"
                    key={m.key}
                    disabled={!!active}
                    className={curMode === m.key ? 'is-active' : ''}
                    onClick={() => { setMode(m.key); setFinished(null) }}
                  >
                    {m.label}
                    <small>{fmtMult(rules.modes[m.key].ladder[rules.levels - 1])}</small>
                  </button>
                ))}
              </div>
            </div>

            {active ? (
              <>
                <div className="tw-stats">
                  <div><span>Level</span><strong>{active.picks.length} / {active.levels}</strong></div>
                  <div><span>Multiplier</span><strong className="is-rose">{(active.multiplier || 1).toFixed(2)}×</strong></div>
                  <div><span>Next level</span><strong>{active.next ? fmtMult(active.next) : '—'}</strong></div>
                  <div><span>Cash out</span><strong className="is-green">{money(cashValue)}</strong></div>
                </div>
                <button type="button" className="tw-play is-cashout" onClick={cashout} disabled={busy || active.picks.length === 0}>
                  {active.picks.length === 0 ? 'Pick a tile on level 1' : <>Cash out <small>{money(cashValue)}</small></>}
                </button>
                <button type="button" className="tw-secondary" disabled={busy} onClick={() => step(randomCol(tiles))}>
                  <Icon name="shuffle" size={15} /> Random tile
                </button>
              </>
            ) : (
              <>
                <div className="tw-stats">
                  <div><span>Level 1 pays</span><strong>{ladder[0] ? fmtMult(ladder[0]) : '—'}</strong></div>
                  <div><span>Reach the top</span><strong className="is-rose">{ladder.length ? fmtMult(ladder[ladder.length - 1]) : '—'}</strong></div>
                </div>
                <button type="button" className="tw-play" onClick={start} disabled={busy || paused || stake > balance}>
                  {busy ? 'Starting…' : stake > balance ? 'Not enough balance' : 'Start climbing'}
                </button>
              </>
            )}

            <p className="tw-note">
              <Icon name="info" size={13} /> Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · Max win ₹{inr(rules.maxWin)} · House edge {rules.houseEdge}%
            </p>
          </aside>
        )}
      </div>

      <div className="tw-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`tw-toast tw-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
