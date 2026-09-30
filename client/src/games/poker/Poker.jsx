import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { createPokerAudio } from './pokerAudio'
import './Poker.css'

const HERO = 0
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' }
// Seat spots around the oval, clockwise from the player at the bottom
const LAYOUTS = {
  2: ['b', 't'],
  3: ['b', 'tl', 'tr'],
  4: ['b', 'l', 't', 'r'],
  5: ['b', 'bl', 'tl', 'tr', 'br'],
  6: ['b', 'bl', 'tl', 't', 'tr', 'br'],
}
const AVATAR_BG = ['#f5a524', '#6366f1', '#10b981', '#f43f5e', '#f97316', '#06b6d4']
// How long each step of a hand stays on screen before the next (ms)
const DELAY = { deal: 450, board: 750, show: 500, win: 900, chip: 650, check: 550, fold: 500, join: 500, info: 300 }

const round2 = (n) => Math.round(n * 100) / 100
const chips = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const inHand = (v) => !!v && !['idle', 'done'].includes(v.street)

function Card({ card, size = 'md' }) {
  if (card === null) {
    return <div className={`pk-card pk-card-${size} is-back`}><span><Icon name="club" size={size === 'sm' ? 9 : 14} strokeWidth={2.4} /></span></div>
  }
  const suit = card[1]
  return (
    <div className={`pk-card pk-card-${size} ${suit === 'h' || suit === 'd' ? 'is-red' : ''}`}>
      <b>{card[0] === 'T' ? '10' : card[0]}</b>
      <i>{SUIT[suit]}</i>
    </div>
  )
}

function Seat({ seat, pos, isDealer, isTurn, done, winner }) {
  return (
    <div className={`pk-seat pk-pos-${pos} ${seat.folded ? 'is-folded' : ''} ${isTurn ? 'is-turn' : ''} ${winner ? 'is-winner' : ''} ${seat.hero ? 'is-hero' : ''}`}>
      {seat.cards.length > 0 && (
        <div className="pk-seat-cards">
          {seat.cards.map((c, i) => <Card key={`${i}${c}`} card={c} size={seat.hero ? 'lg' : 'sm'} />)}
        </div>
      )}
      <div className="pk-seat-box">
        <span className="pk-avatar" style={{ background: AVATAR_BG[seat.avatar % AVATAR_BG.length] }}>
          {seat.hero ? <Icon name="user" size={16} strokeWidth={2.4} /> : seat.name[0].toUpperCase()}
        </span>
        <span className="pk-seat-info">
          <span className="pk-seat-name">{seat.hero ? 'You' : seat.name}</span>
          <strong>{chips(seat.stack)}</strong>
        </span>
        {isDealer && <span className="pk-dealer">D</span>}
        {seat.action && !(done && winner) && <span className={`pk-tag pk-tag-${seat.action.toLowerCase().replace(/[^a-z]/g, '')}`}>{seat.action}</span>}
        {done && winner && <span className="pk-tag pk-tag-win">+{chips(seat.won)}</span>}
      </div>
      {seat.bet > 0 && <span className="pk-bet"><i />{chips(seat.bet)}</span>}
    </div>
  )
}

export default function Poker() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [table, setTable] = useState(null) // latest table from the server
  const [queue, setQueue] = useState([]) // hand steps still to animate
  const [display, setDisplay] = useState(null) // step on screen while animating
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [toasts, setToasts] = useState([])
  const [buyIn, setBuyIn] = useState('')
  const [raiseTo, setRaiseTo] = useState(null)
  const [showLog, setShowLog] = useState(false)
  const [topUp, setTopUp] = useState(null) // amount while the top-up panel is open
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [autoDeal, setAutoDeal] = useState(true)
  const [deadline, setDeadline] = useState(null)
  const [now, setNow] = useState(0)
  const audio = useRef(null)
  const tableRef = useRef(null)
  const leavingRef = useRef(null)
  const loadRef = useRef(null)
  const dealRef = useRef(null)

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  /** Apply a server response: queue its steps for animation, keep the final table. */
  const receive = useCallback((d) => {
    if (d.balance != null) setBalance(d.balance)
    const next = d.table === undefined ? tableRef.current : d.table
    if (d.frames?.length) {
      setDisplay(tableRef.current ?? d.frames[0].view)
      setQueue(d.frames.map((f, i) => (i === 0 ? { ...f, fast: true } : f)))
    }
    tableRef.current = next
    setTable(next)
    setRaiseTo(null)
    setDeadline(next?.timeLeft != null ? Date.now() + next.timeLeft : null)
  }, [setBalance])

  const finishLeave = useCallback(() => {
    const s = leavingRef.current
    leavingRef.current = null
    tableRef.current = null
    setTable(null)
    setDisplay(null)
    setDeadline(null)
    setConfirmLeave(false)
    setRecent((r) => [s, ...r].slice(0, 10))
    toast(s.win > s.amount ? 'success' : 'info', `You left the table with ${money(s.win)}`)
  }, [toast])

  const load = useCallback(
    () => api.get('/games/poker/state').then((d) => {
      setRules(d.rules)
      setRecent(d.recent)
      setBuyIn((b) => b || String(Math.min(d.rules.maxBuyIn, Math.max(d.rules.minBuyIn, d.rules.bigBlind * 100))))
      receive(d)
    }, (err) => setError(err.message)),
    [receive],
  )

  useEffect(() => {
    audio.current = createPokerAudio()
    load()
    return () => audio.current.dispose()
  }, [load])

  // Play queued steps one by one
  useEffect(() => {
    if (!queue.length) return
    const [frame, ...rest] = queue
    const t = setTimeout(() => {
      setDisplay(frame.view)
      audio.current?.play(frame.kind)
      setQueue(rest)
      if (rest.length) return
      if (leavingRef.current) finishLeave()
      else if (tableRef.current?.options) audio.current?.turn()
    }, frame.fast ? 120 : DELAY[frame.kind] ?? 600)
    return () => clearTimeout(t)
  }, [queue, finishLeave])

  const call = async (action, body) => {
    setBusy(true)
    try {
      return await api.post(`/games/poker/${action}`, body)
    } catch (err) {
      toast('error', err.message)
      if ([403, 404, 409].includes(err.status)) load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const playing = queue.length > 0
  const view = playing && display ? { ...table, ...display, options: null } : table
  const hero = view?.seats[HERO]
  const opts = !playing && !busy ? view?.options : null
  const handOver = !!view && !inHand(view)
  const paused = rules && !rules.enabled

  const sit = async () => {
    audio.current.chip()
    const d = await call('sit', { amount: Number(buyIn) })
    if (d) receive(d)
  }

  const deal = async () => {
    if (busy || playing) return
    setConfirmLeave(false)
    const d = await call('deal')
    if (d) receive(d)
  }

  const act = async (action, amount) => {
    if (!opts) return
    const d = await call('act', { action, amount })
    if (d) receive(d)
  }

  const leave = async () => {
    if (inHand(view) && !hero.folded && !confirmLeave) {
      setConfirmLeave(true)
      return
    }
    const d = await call('leave')
    if (!d) return
    leavingRef.current = d.session
    receive({ ...d, table: undefined })
    if (!d.frames.length) finishLeave()
  }

  const addChips = async () => {
    const d = await call('topup', { amount: Number(topUp) })
    if (!d) return
    receive(d)
    setTopUp(null)
    toast('success', `Added ${money(Number(topUp))} to your stack`)
  }

  useEffect(() => {
    loadRef.current = load
    dealRef.current = deal
  })

  // Deal the next hand automatically a few seconds after one ends
  const heroStack = table?.seats[HERO].stack ?? 0
  useEffect(() => {
    if (!autoDeal || !table || playing || busy || inHand(table) || heroStack <= 0 || topUp !== null || confirmLeave || paused) return
    const t = setTimeout(() => dealRef.current(), 3500)
    return () => clearTimeout(t)
  }, [autoDeal, table, playing, busy, heroStack, topUp, confirmLeave, paused])

  // Turn clock; when it runs out the server checks or folds for the player
  useEffect(() => {
    if (!deadline) return
    let fired = false
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (!fired && t > deadline + 800) {
        fired = true
        loadRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [deadline])

  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  // ── Derived table numbers ──────────────────────────────────
  const seats = view?.seats ?? []
  const layout = LAYOUTS[seats.length] ?? LAYOUTS[6]
  const streetBets = seats.reduce((t, s) => t + s.bet, 0)
  const centerPot = view ? round2(view.pot - streetBets) : 0
  const winners = new Set(view?.street === 'done' ? (view.result?.winners ?? []).map((w) => w.seat) : [])
  const turnSeconds = view?.turnSeconds ?? rules?.turnSeconds ?? 30
  const secondsLeft = opts && deadline && now ? Math.min(turnSeconds, Math.max(0, Math.ceil((deadline - now) / 1000))) : turnSeconds

  const minR = opts?.minRaiseTo ?? 0
  const maxR = opts?.maxRaiseTo ?? 0
  const raiseVal = opts ? Math.min(maxR, Math.max(minR, raiseTo ?? minR)) : 0
  const allInRaise = opts && raiseVal >= maxR
  const preset = (frac) => setRaiseTo(round2(view.currentBet + frac * (view.pot + opts.toCall)))
  const callAllIn = opts && opts.toCall > 0 && opts.toCall >= hero.stack

  const status = view?.log?.length ? view.log[view.log.length - 1] : ''
  const buyInNum = Number(buyIn) || 0
  const topUpRoom = table ? round2(table.maxBuyIn - heroStack) : 0

  const resultLine = view?.street === 'done' && view.result?.winners.length
    ? view.result.winners.map((w) => `${w.seat === HERO ? 'You win' : `${seats[w.seat]?.name} wins`} ${chips(w.won)}${w.hand ? ` · ${w.hand}` : ''}`).join('  |  ')
    : null

  return (
    <div className="pk-root">
      <header className="pk-header">
        <button type="button" className="pk-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="pk-title">
          <span className="pk-logo"><Icon name="club" size={16} strokeWidth={2.2} /></span>
          <span>
            Poker
            {table && <small>Blinds {chips(table.blinds.small)} / {chips(table.blinds.big)} · Hand #{view.handNo}</small>}
          </span>
        </div>
        {table && (
          <button type="button" className="pk-icon-btn" onClick={() => setShowLog(true)} aria-label="Hand history">
            <Icon name="history" size={18} />
          </button>
        )}
        <button type="button" className="pk-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <div className="pk-balance" title="Wallet balance (shared across all games)">
          <Icon name="wallet" size={15} />
          <strong>{money(balance)}</strong>
        </div>
      </header>

      {paused && (
        <div className="pk-paused"><Icon name="lock" size={14} strokeWidth={2.2} /> Poker is paused by the operator. {table ? 'Leave the table to cash out your chips.' : 'New tables are closed.'}</div>
      )}

      <main className="pk-main">
        {/* ── Table ─────────────────────────────────────── */}
        <div className="pk-table-wrap">
          <div className="pk-rail">
            <div className="pk-felt">
              <div className="pk-watermark"><Icon name="club" size={90} strokeWidth={1.2} /></div>

              {view ? (
                <div className="pk-center">
                  <div className="pk-board">
                    {[0, 1, 2, 3, 4].map((i) => (view.board[i]
                      ? <Card key={view.board[i]} card={view.board[i]} size="md" />
                      : <div key={`slot${i}`} className="pk-card pk-card-md is-slot" />))}
                  </div>
                  <div className="pk-pot"><Icon name="coins" size={13} /> Pot <strong>{chips(centerPot)}</strong></div>
                  {resultLine && <div className="pk-result">{resultLine}</div>}
                </div>
              ) : (
                <div className="pk-center">
                  {error && !rules ? (
                    <div className="pk-msg"><Icon name="circleAlert" size={20} /> {error}</div>
                  ) : !rules ? (
                    <div className="pk-msg"><span className="pk-spinner" /></div>
                  ) : (
                    <div className="pk-welcome">
                      <strong>Texas Hold&apos;em</strong>
                      <span>{rules.bots} opponents · Blinds {chips(rules.smallBlind)} / {chips(rules.bigBlind)}</span>
                    </div>
                  )}
                </div>
              )}

              {seats.map((s, i) => (
                <Seat
                  key={i}
                  seat={s}
                  pos={layout[i]}
                  isDealer={view.dealer === i && view.handNo > 0}
                  isTurn={inHand(view) && view.turn === i}
                  done={view.street === 'done'}
                  winner={winners.has(i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Controls ──────────────────────────────────── */}
        {rules && !table && (
          <section className="pk-panel pk-buyin">
            <div className="pk-label"><span>Buy-in</span><em>{chips(rules.minBuyIn)} – {chips(rules.maxBuyIn)}</em></div>
            <div className="pk-amount">
              <span>₹</span>
              <input type="number" inputMode="decimal" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} aria-label="Buy-in amount" />
            </div>
            <input
              type="range"
              className="pk-range"
              min={rules.minBuyIn}
              max={rules.maxBuyIn}
              step={rules.bigBlind}
              value={Math.min(rules.maxBuyIn, Math.max(rules.minBuyIn, buyInNum))}
              onChange={(e) => setBuyIn(e.target.value)}
              aria-label="Buy-in slider"
            />
            <div className="pk-quick">
              <button type="button" onClick={() => setBuyIn(String(rules.minBuyIn))}>Min</button>
              <button type="button" onClick={() => setBuyIn(String(round2((rules.minBuyIn + rules.maxBuyIn) / 2)))}>Mid</button>
              <button type="button" onClick={() => setBuyIn(String(rules.maxBuyIn))}>Max</button>
            </div>
            <div className="pk-stats">
              <div><span>Blinds</span><strong>{chips(rules.smallBlind)} / {chips(rules.bigBlind)}</strong></div>
              <div><span>Opponents</span><strong>{rules.bots}</strong></div>
              <div><span>Rake</span><strong>{rules.rake > 0 && rules.rakeCap > 0 ? `${rules.rake}% · max ${chips(rules.rakeCap)}` : 'None'}</strong></div>
              <div><span>Time to act</span><strong>{rules.turnSeconds}s</strong></div>
            </div>
            <button
              type="button"
              className="pk-play"
              onClick={sit}
              disabled={busy || paused || buyInNum < rules.minBuyIn || buyInNum > rules.maxBuyIn || buyInNum > balance}
            >
              {busy ? 'Taking a seat…' : buyInNum > balance ? 'Not enough balance' : <>Take a seat <small>{money(buyInNum)}</small></>}
            </button>
            <p className="pk-note">
              <Icon name="info" size={13} /> Your buy-in becomes table chips. Leave any time to move your chips back to your wallet.
              Rake is only taken from pots you win after the flop.
            </p>
            {recent.length > 0 && (
              <div className="pk-recent">
                <span className="pk-label"><span>Recent tables</span></span>
                {recent.map((r) => (
                  <div key={r.id} className="pk-recent-row">
                    <span>{r.hands} hand{r.hands === 1 ? '' : 's'} · in {chips(r.amount)}</span>
                    <strong className={r.win > r.amount ? 'is-green' : r.win < r.amount ? 'is-red' : ''}>
                      {r.win >= r.amount ? '+' : '−'}{chips(Math.abs(round2(r.win - r.amount)))}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {table && view && (
          <section className="pk-panel pk-actions">
            <div className="pk-info">
              <span><i className="pk-dot" /> {view.heroHand ? <>Your hand: <strong>{view.heroHand}</strong></> : 'Waiting for cards'}</span>
              <span className="pk-status">{status}</span>
            </div>

            {opts ? (
              <>
                <div className="pk-timer"><i style={{ width: `${(secondsLeft / turnSeconds) * 100}%` }} className={secondsLeft <= 5 ? 'is-low' : ''} /></div>
                {opts.canRaise && maxR > minR && (
                  <div className="pk-raise">
                    <div className="pk-label">
                      <span>{view.currentBet > 0 ? 'Raise to' : 'Bet'}</span>
                      <em>{chips(raiseVal)} · {secondsLeft}s</em>
                    </div>
                    <input type="range" className="pk-range" min={minR} max={maxR} step="0.01" value={raiseVal} onChange={(e) => setRaiseTo(Number(e.target.value))} aria-label="Raise amount" />
                    <div className="pk-quick pk-quick-5">
                      <button type="button" onClick={() => setRaiseTo(minR)}>Min</button>
                      <button type="button" onClick={() => preset(0.5)}>½ Pot</button>
                      <button type="button" onClick={() => preset(0.75)}>¾ Pot</button>
                      <button type="button" onClick={() => preset(1)}>Pot</button>
                      <button type="button" className="is-allin" onClick={() => setRaiseTo(maxR)}>All-in</button>
                    </div>
                  </div>
                )}
                <div className={`pk-btns ${opts.canRaise ? '' : 'is-two'}`}>
                  <button type="button" className="pk-btn pk-btn-fold" onClick={() => act('fold')}>
                    <Icon name="x" size={16} strokeWidth={2.6} /> Fold
                  </button>
                  <button type="button" className="pk-btn pk-btn-call" onClick={() => act(opts.toCall > 0 ? 'call' : 'check')}>
                    {opts.toCall > 0 ? (callAllIn ? `All-in ${chips(opts.toCall)}` : `Call ${chips(opts.toCall)}`) : 'Check'}
                  </button>
                  {opts.canRaise && (
                    <button type="button" className="pk-btn pk-btn-raise" onClick={() => (allInRaise ? act('allin') : act('raise', raiseVal))}>
                      {allInRaise ? `All-in ${chips(maxR)}` : `${view.currentBet > 0 ? 'Raise to' : 'Bet'} ${chips(raiseVal)}`}
                    </button>
                  )}
                </div>
              </>
            ) : handOver && !playing ? (
              topUp !== null ? (
                <div className="pk-topup">
                  <div className="pk-label"><span>Add chips</span><em>up to {chips(Math.min(topUpRoom, balance))}</em></div>
                  <div className="pk-amount">
                    <span>₹</span>
                    <input type="number" inputMode="decimal" value={topUp} onChange={(e) => setTopUp(e.target.value)} aria-label="Top-up amount" autoFocus />
                  </div>
                  <div className="pk-btns is-two">
                    <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setTopUp(null)}>Cancel</button>
                    <button type="button" className="pk-btn pk-btn-call" disabled={busy || !(Number(topUp) > 0) || Number(topUp) > topUpRoom || Number(topUp) > balance} onClick={addChips}>
                      Add {money(Number(topUp) || 0)}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pk-btns">
                    <button type="button" className="pk-btn pk-btn-ghost" onClick={leave} disabled={busy}>
                      <Icon name="logout" size={16} /> Leave
                    </button>
                    <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setTopUp(String(Math.max(0, Math.min(topUpRoom, balance))))} disabled={busy || paused || topUpRoom <= 0}>
                      <Icon name="plus" size={16} strokeWidth={2.4} /> Top up
                    </button>
                    <button type="button" className="pk-btn pk-btn-raise" onClick={deal} disabled={busy || paused || heroStack <= 0}>
                      {heroStack <= 0 ? 'Out of chips' : 'Deal'}
                    </button>
                  </div>
                  <label className="pk-auto">
                    <input type="checkbox" checked={autoDeal} onChange={(e) => setAutoDeal(e.target.checked)} />
                    Deal the next hand automatically
                  </label>
                </>
              )
            ) : (
              <div className="pk-btns is-one">
                <button type="button" className={`pk-btn ${confirmLeave ? 'pk-btn-fold' : 'pk-btn-ghost'}`} onClick={leave} disabled={busy || playing}>
                  <Icon name="logout" size={16} /> {confirmLeave ? 'Tap again to fold and leave' : playing ? 'Playing…' : 'Leave table'}
                </button>
              </div>
            )}

            {opts && (
              <button type="button" className={`pk-leave-link ${confirmLeave ? 'is-armed' : ''}`} onClick={leave} disabled={busy}>
                {confirmLeave ? 'Tap again to fold and leave the table' : 'Leave table'}
              </button>
            )}

            <p className="pk-note">
              <Icon name="info" size={13} /> Chips {chips(hero.stack)} · Bought in {chips(table.buyIn)}
              {table.rake > 0 && <> · Rake paid {chips(table.rake)}</>}
            </p>
          </section>
        )}
      </main>

      {showLog && table && (
        <div className="pk-modal" onClick={() => setShowLog(false)}>
          <div className="pk-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pk-modal-head">
              <strong><Icon name="history" size={16} /> Hand history</strong>
              <button type="button" className="pk-icon-btn" onClick={() => setShowLog(false)} aria-label="Close"><Icon name="x" size={18} /></button>
            </div>
            <div className="pk-log">
              {[...(view?.log ?? [])].reverse().map((line, i) => (
                <div key={i} className={line.startsWith('Hand #') ? 'is-hand' : line.startsWith('You win') ? 'is-win' : ''}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      )}

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
