import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createMinesAudio } from './minesAudio'
import './Mines.css'

const TILES = 25
const QUICK_MINES = [1, 3, 5, 10, 20, 24]
const inr = (n) => Number(n).toLocaleString('en-IN')
const randomOf = (list) => list[Math.floor(Math.random() * list.length)]

export default function Mines() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [active, setActive] = useState(null) // round in progress
  const [finished, setFinished] = useState(null) // last settled round, shown until the next start
  const [recent, setRecent] = useState([])
  const [amount, setAmount] = useState('100')
  const [mines, setMines] = useState(3)
  const [busy, setBusy] = useState(false)
  const [lastTile, setLastTile] = useState(-1)
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
    if (d.active) setMines(d.active.mines)
  }, [setBalance])

  const load = useCallback(
    () => api.get('/games/mines/state').then(apply, (err) => setError(err.message)),
    [apply],
  )

  useEffect(() => {
    audio.current = createMinesAudio()
    load()
    return () => audio.current.dispose()
  }, [load])

  const call = async (action, body) => {
    setBusy(true)
    try {
      const d = await api.post(`/games/mines/${action}`, body)
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
      audio.current.boom()
    }
  }

  const count = active ? active.mines : rules ? Math.min(rules.maxMines, Math.max(rules.minMines, mines)) : mines
  const ladder = rules?.table?.[count] ?? []
  const round = active ?? finished
  const picks = round?.picks ?? []
  const stake = Number(amount) || 0

  const start = async () => {
    if (busy) return
    audio.current.click()
    const d = await call('start', { amount: stake, mines: count })
    if (!d) return
    setFinished(null)
    setLastTile(-1)
    setActive(d.bet)
  }

  const reveal = async (tile) => {
    if (!active || busy || active.picks.includes(tile)) return
    const d = await call('reveal', { tile })
    if (!d) return
    setLastTile(tile)
    if (d.bet.status === 'active') {
      setActive(d.bet)
      audio.current.gem(d.bet.picks.length)
    } else {
      settle(d.bet)
    }
  }

  const cashout = async () => {
    if (!active || busy || active.picks.length === 0) return
    const d = await call('cashout')
    if (d) settle(d.bet)
  }

  const randomTile = () => {
    const free = Array.from({ length: TILES }, (_, i) => i).filter((i) => !picks.includes(i))
    if (free.length) reveal(randomOf(free))
  }

  const clampStake = (v) => (rules ? String(Math.round(Math.min(rules.maxBet, Math.max(rules.minBet, v)) * 100) / 100) : String(v))

  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  const tileState = (i) => {
    if (!round) return 'hidden'
    if (round.status === 'active') return picks.includes(i) ? 'gem' : 'hidden'
    if (round.board?.includes(i)) return round.hit === i ? 'boom' : 'mine'
    return picks.includes(i) ? 'gem' : 'gem-dim'
  }

  const cashValue = active ? active.amount * active.multiplier : 0
  const paused = rules && !rules.enabled

  return (
    <div className="mn-root">
      <header className="mn-header">
        <button type="button" className="mn-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="mn-title">
          <span className="mn-logo"><Icon name="bomb" size={16} strokeWidth={2.2} /></span>
          Mines
        </div>
        <button type="button" className="mn-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="mn-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      <div className="mn-layout">
        {/* ── Board ─────────────────────────────────────── */}
        <section className="mn-stage">
          <div className="mn-recent">
            {recent.length === 0 ? (
              <span className="mn-recent-empty">Your last rounds will show here</span>
            ) : recent.slice(0, 12).map((b) => (
              <span key={b.id} className={`mn-chip ${b.status === 'won' ? 'is-win' : ''}`}>
                {b.status === 'won' ? `${b.multiplier.toFixed(2)}×` : <><Icon name="bomb" size={11} strokeWidth={2.4} /> {b.mines}</>}
              </span>
            ))}
          </div>

          {paused && (
            <div className="mn-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Mines is paused by the operator. New rounds are disabled.</div>
          )}

          <div className="mn-board">
            {error && !rules ? (
              <div className="mn-board-msg"><Icon name="circleAlert" size={20} /> {error}</div>
            ) : !rules ? (
              <div className="mn-board-msg"><span className="mn-spinner" /></div>
            ) : (
              <div className={`mn-grid ${active ? 'is-live' : ''}`}>
                {Array.from({ length: TILES }, (_, i) => {
                  const st = tileState(i)
                  return (
                    <button
                      type="button"
                      key={i}
                      className={`mn-tile is-${st} ${lastTile === i ? 'is-last' : ''}`}
                      onClick={() => reveal(i)}
                      disabled={!active || st !== 'hidden' || busy}
                      aria-label={st === 'hidden' ? `Tile ${i + 1}` : st.startsWith('gem') ? 'Gem' : 'Mine'}
                    >
                      {st.startsWith('gem') && <Icon name="gem" size={30} strokeWidth={1.7} fill="rgba(52, 211, 153, 0.3)" />}
                      {(st === 'mine' || st === 'boom') && <Icon name="bomb" size={30} strokeWidth={1.7} fill="rgba(244, 63, 94, 0.3)" />}
                    </button>
                  )
                })}
              </div>
            )}

            {finished && (
              <div key={finished.id} className={`mn-outcome ${finished.status === 'won' ? '' : 'is-loss'}`}>
                <strong>{finished.status === 'won' ? `${finished.multiplier.toFixed(2)}×` : 'Boom!'}</strong>
                <span>{finished.status === 'won' ? `+${money(finished.win)}` : `−${money(finished.amount)}`}</span>
              </div>
            )}
          </div>

          {/* Multiplier ladder for the chosen mine count */}
          {rules && (
            <div className="mn-ladder" aria-label="Payout for each gem">
              {ladder.slice(0, 12).map((m, i) => (
                <span key={i} className={`${i < picks.length && round?.status !== 'lost' ? 'is-done' : ''} ${active && i === active.picks.length ? 'is-next' : ''}`}>
                  <em>{i + 1}</em>{m >= 1000 ? `${Math.round(m).toLocaleString('en-IN')}` : m.toFixed(2)}×
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Controls ──────────────────────────────────── */}
        {rules && (
          <aside className="mn-panel">
            <div className="mn-field">
              <div className="mn-label"><span>Bet amount</span><em>{money(stake)}</em></div>
              <div className="mn-amount">
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
              <div className="mn-quick">
                {[10, 50, 100, 500, 1000].filter((p) => p >= rules.minBet && p <= rules.maxBet).map((p) => (
                  <button type="button" key={p} disabled={!!active} className={stake === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mn-field">
              <div className="mn-label"><span>Mines</span><em>{TILES - count} gems</em></div>
              <div className="mn-stepper">
                <button type="button" onClick={() => setMines(count - 1)} disabled={!!active || count <= rules.minMines} aria-label="Fewer mines">
                  <Icon name="minus" size={16} strokeWidth={2.4} />
                </button>
                <strong><Icon name="bomb" size={17} strokeWidth={2} /> {count}</strong>
                <button type="button" onClick={() => setMines(count + 1)} disabled={!!active || count >= rules.maxMines} aria-label="More mines">
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                </button>
              </div>
              <div className="mn-quick">
                {QUICK_MINES.filter((q) => q >= rules.minMines && q <= rules.maxMines).map((q) => (
                  <button type="button" key={q} disabled={!!active} className={count === q ? 'is-active' : ''} onClick={() => setMines(q)}>{q}</button>
                ))}
              </div>
            </div>

            {active ? (
              <>
                <div className="mn-stats">
                  <div><span>Multiplier</span><strong className="is-amber">{(active.multiplier || 1).toFixed(2)}×</strong></div>
                  <div><span>Next gem</span><strong>{active.next ? `${active.next.toFixed(2)}×` : '—'}</strong></div>
                  <div><span>Gems found</span><strong>{active.picks.length} / {TILES - count}</strong></div>
                  <div><span>Cash out</span><strong className="is-green">{money(cashValue)}</strong></div>
                </div>
                <button type="button" className="mn-play is-cashout" onClick={cashout} disabled={busy || active.picks.length === 0}>
                  {active.picks.length === 0 ? 'Pick a tile to begin' : <>Cash out <small>{money(cashValue)}</small></>}
                </button>
                <button type="button" className="mn-secondary" onClick={randomTile} disabled={busy}>
                  <Icon name="shuffle" size={15} /> Pick random tile
                </button>
              </>
            ) : (
              <>
                <div className="mn-stats">
                  <div><span>First gem pays</span><strong>{ladder[0] ? `${ladder[0].toFixed(2)}×` : '—'}</strong></div>
                  <div><span>Clear the board</span><strong className="is-amber">{ladder.length ? `${inr(ladder[ladder.length - 1])}×` : '—'}</strong></div>
                </div>
                <button type="button" className="mn-play" onClick={start} disabled={busy || paused || stake > balance}>
                  {busy ? 'Starting…' : stake > balance ? 'Not enough balance' : 'Start game'}
                </button>
              </>
            )}

            <p className="mn-note">
              <Icon name="info" size={13} /> Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · Max win ₹{inr(rules.maxWin)} · House edge {rules.houseEdge}%
            </p>
          </aside>
        )}
      </div>

      <div className="mn-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`mn-toast mn-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
