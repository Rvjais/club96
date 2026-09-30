import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icons'
import { subscribe } from '../../lib/api'
import { money } from '../../lib/format'
import { useAuth } from '../../auth/authContext'
import { ROOM_KEYS, ROOM_TABS, colorsOf, createWingoEngine, pickLabel, pickOdds, sizeOf } from './wingoEngine'
import { createWingoAudio } from './wingoAudio'
import './WinGo.css'

const BASES = [1, 10, 100, 1000]
const MULTS = [1, 5, 10, 20, 50, 100]
const inr = (n) => Number(n).toLocaleString('en-IN')
const randomDigit = () => String(Math.floor(Math.random() * 10))

/** Colour class for a number ball: "red", "green", "red-violet" or "green-violet". */
const ballClass = (n) => colorsOf(n).join('-')

function Ball({ n, size = '' }) {
  return <span className={`wg-ball wg-ball-${ballClass(n)} ${size}`}>{n}</span>
}

function Dots({ n }) {
  return (
    <span className="wg-dots">
      {colorsOf(n).map((c) => <i key={c} className={`wg-dot-${c}`} />)}
    </span>
  )
}

export default function WinGo() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const room = ROOM_KEYS.includes(params.get('room')) ? params.get('room') : '30s'
  const { setBalance, refresh } = useAuth()
  const [snap, setSnap] = useState({ ready: false })
  const [sheet, setSheet] = useState(null) // pick being bet on
  const [base, setBase] = useState(1)
  const [qty, setQty] = useState(1)
  const [placing, setPlacing] = useState(false)
  const [tab, setTab] = useState('history')
  const [popup, setPopup] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [toasts, setToasts] = useState([])
  const engine = useRef(null)
  const audio = useRef(null)
  const roomRef = useRef(room)
  const lastPip = useRef(null)

  useEffect(() => { roomRef.current = room }, [room])

  const toast = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500)
  }, [])

  useEffect(() => {
    audio.current = createWingoAudio()
    let popupTimer = 0
    const e = createWingoEngine({
      onState: (v) => {
        setSnap(v)
        setBalance(v.balance)
      },
      onEvent: (ev) => {
        if (ev.type === 'locked' && ev.room === roomRef.current) setSheet(null)
        if (ev.type === 'result' && ev.played) {
          setPopup(ev)
          if (ev.winnings > 0) audio.current.win()
          else audio.current.lose()
          clearTimeout(popupTimer)
          popupTimer = setTimeout(() => setPopup(null), 4500)
        }
      },
    })
    engine.current = e
    e.start()
    let lastCheck = 0
    const unsubscribe = subscribe('/games/wingo/stream', e.sync, () => {
      if (Date.now() - lastCheck < 5000) return
      lastCheck = Date.now()
      refresh().catch(() => {})
    })
    return () => {
      unsubscribe()
      e.stop()
      clearTimeout(popupTimer)
      audio.current.dispose()
    }
  }, [setBalance, refresh])

  const r = snap.ready ? snap.rooms[room] : null
  const rules = snap.rules
  const seconds = r ? Math.ceil(r.timeLeft / 1000) : 0
  const locked = !r || r.phase !== 'open' || !rules.enabled || !r.open

  // Countdown pips in the last 5 seconds
  useEffect(() => {
    if (!r || seconds > 5 || seconds < 1 || lastPip.current === `${r.period.id}:${seconds}`) return
    lastPip.current = `${r.period.id}:${seconds}`
    audio.current?.pip(seconds === 1)
  }, [r, seconds])

  // Escape closes the sheets
  useEffect(() => {
    if (!sheet && !rulesOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setSheet(null)
      setRulesOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, rulesOpen])

  const openSheet = (pick) => {
    audio.current.unlock()
    if (!r) return
    if (!rules.enabled) return toast('error', 'Win Go is paused. Please try again later.')
    if (!r.open) return toast('error', `${r.label} is closed right now`)
    if (locked) return toast('error', 'Betting is closed for this period')
    audio.current.click()
    setSheet(pick)
  }

  const total = base * qty

  const confirm = async () => {
    if (!sheet || placing) return
    setPlacing(true)
    const res = await engine.current.placeBet(room, sheet, total)
    setPlacing(false)
    if (!res.ok) return toast('error', res.error)
    toast('success', `Bet ${money(total)} on ${pickLabel(sheet)}`)
    setSheet(null)
  }

  const toggleSound = () => {
    audio.current.setEnabled(muted)
    setMuted(!muted)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const recent = r?.history ?? []
  const myRecords = (snap.records ?? []).filter((b) => b.room === room)
  const sheetTone = sheet == null ? '' : /^\d$/.test(sheet) ? ballClass(Number(sheet)).split('-')[0] : sheet === 'big' ? 'big' : sheet === 'small' ? 'small' : sheet

  return (
    <div className="wg-root">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="wg-header">
        <button type="button" className="wg-icon-btn" onClick={() => navigate('/game')} aria-label="Back to lobby">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="wg-title">Win Go</div>
        <button type="button" className="wg-icon-btn" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
          <Icon name={muted ? 'volumeOff' : 'volume'} size={19} />
        </button>
      </header>

      <main className="wg-main">
        {/* ── Wallet ─────────────────────────────────────────── */}
        <section className="wg-wallet">
          <div className="wg-wallet-amount">
            {money(snap.ready ? snap.balance : 0)}
            <button type="button" onClick={() => refresh().catch(() => {})} aria-label="Refresh balance"><Icon name="refresh" size={16} /></button>
          </div>
          <span className="wg-wallet-label"><Icon name="wallet" size={14} /> Wallet balance</span>
          <div className="wg-wallet-actions">
            <button type="button" className="wg-btn-withdraw" onClick={() => navigate('/account?open=withdraw')}>Withdraw</button>
            <button type="button" className="wg-btn-deposit" onClick={() => navigate('/deposit')}>Deposit</button>
          </div>
        </section>

        {/* ── Rooms ─────────────────────────────────────────── */}
        <section className="wg-rooms" role="tablist">
          {ROOM_KEYS.map((k) => {
            const closed = snap.ready && !snap.rooms[k]?.open
            return (
              <button
                type="button"
                role="tab"
                aria-selected={room === k}
                key={k}
                className={`wg-room ${room === k ? 'is-active' : ''} ${closed ? 'is-closed' : ''}`}
                onClick={() => { setParams({ room: k }, { replace: true }); setSheet(null) }}
              >
                <Icon name="clock" size={26} strokeWidth={1.8} />
                <span>Win Go</span>
                <strong>{ROOM_TABS[k]}</strong>
              </button>
            )
          })}
        </section>

        {/* ── Timer ─────────────────────────────────────────── */}
        <section className="wg-timer">
          <div className="wg-timer-left">
            <button type="button" className="wg-howto" onClick={() => setRulesOpen(true)}>
              <Icon name="bookOpen" size={14} /> How to play
            </button>
            <strong className="wg-timer-name">{r?.label ?? 'Win Go'}</strong>
            <div className="wg-timer-balls">
              {recent.slice(0, 5).map((h) => <Ball key={h.period} n={h.number} size="is-sm" />)}
            </div>
          </div>
          <div className="wg-timer-right">
            <span>Time remaining</span>
            <div className="wg-digits">
              {[mm[0], mm[1], ':', ss[0], ss[1]].map((d, i) => <b key={i} className={d === ':' ? 'is-colon' : ''}>{snap.ready ? d : '-'}</b>)}
            </div>
            <em>{r?.period.label ?? 'Connecting…'}</em>
          </div>
        </section>

        {snap.ready && !rules.enabled && (
          <div className="wg-note wg-note-red"><Icon name="lock" size={14} /> Win Go is paused by the operator. Bets already placed will still be settled.</div>
        )}
        {snap.ready && rules.enabled && r && !r.open && (
          <div className="wg-note wg-note-red"><Icon name="lock" size={14} /> {r.label} is closed right now. Try another room.</div>
        )}

        {/* ── Betting board ─────────────────────────────────── */}
        <section className="wg-board">
          {r && r.phase !== 'open' && rules.enabled && r.open && (
            <div className="wg-lock" aria-live="polite">
              <b>{String(Math.min(seconds, 99)).padStart(2, '0')[0]}</b>
              <b>{String(Math.min(seconds, 99)).padStart(2, '0')[1]}</b>
            </div>
          )}

          <div className="wg-colors">
            {['green', 'violet', 'red'].map((c) => (
              <button type="button" key={c} className={`wg-color wg-color-${c}`} onClick={() => openSheet(c)}>
                {pickLabel(c)}
                {rules && <small>{pickOdds(c, rules.payouts)}</small>}
              </button>
            ))}
          </div>

          <div className="wg-numbers">
            {Array.from({ length: 10 }, (_, n) => (
              <button type="button" key={n} className="wg-number" onClick={() => openSheet(String(n))} aria-label={`Number ${n}`}>
                <Ball n={n} size="is-lg" />
              </button>
            ))}
          </div>

          <div className="wg-mults">
            <button type="button" className="wg-random" onClick={() => openSheet(randomDigit())}>Random</button>
            {MULTS.map((m) => (
              <button type="button" key={m} className={qty === m ? 'is-active' : ''} onClick={() => setQty(m)}>X{m}</button>
            ))}
          </div>

          <div className="wg-size">
            <button type="button" className="wg-big" onClick={() => openSheet('big')}>Big {rules && <small>{rules.payouts.size}x</small>}</button>
            <button type="button" className="wg-small" onClick={() => openSheet('small')}>Small {rules && <small>{rules.payouts.size}x</small>}</button>
          </div>
        </section>

        {/* ── Your bets this period ─────────────────────────── */}
        {r?.bets.length > 0 && (
          <section className="wg-card">
            <div className="wg-card-head">
              <h2>Your bets · {r.period.label.slice(-5)}</h2>
              <strong>{money(r.bets.reduce((t, b) => t + b.amount, 0))}</strong>
            </div>
            <div className="wg-mybets">
              {r.bets.map((b) => (
                <span key={b.id} className={`wg-chip wg-chip-${/^\d$/.test(b.pick) ? ballClass(Number(b.pick)).split('-')[0] : b.pick}`}>
                  {pickLabel(b.pick)} · {money(b.amount)}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── History / chart / mine ────────────────────────── */}
        <section className="wg-card">
          <div className="wg-tabs">
            {[['history', 'Game history'], ['chart', 'Chart'], ['mine', 'My history']].map(([k, label]) => (
              <button type="button" key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === 'history' && (
            <div className="wg-table">
              <div className="wg-table-head"><span>Period</span><span>Number</span><span>Big Small</span><span>Color</span></div>
              {recent.slice(0, 15).map((h) => (
                <div key={h.period} className="wg-table-row">
                  <span className="wg-mono">{h.period}</span>
                  <span className={`wg-num wg-num-${ballClass(h.number)}`}>{h.number}</span>
                  <span>{sizeOf(h.number) === 'big' ? 'Big' : 'Small'}</span>
                  <span><Dots n={h.number} /></span>
                </div>
              ))}
            </div>
          )}

          {tab === 'chart' && (
            <div className="wg-chart">
              <div className="wg-chart-stats">
                {Array.from({ length: 10 }, (_, n) => {
                  const count = recent.filter((h) => h.number === n).length
                  return <span key={n}><Ball n={n} size="is-xs" /><em>{count}</em></span>
                })}
              </div>
              <p className="wg-chart-cap">Times each number was drawn in the last {recent.length} periods</p>
              {recent.slice(0, 15).map((h) => (
                <div key={h.period} className="wg-chart-row">
                  <span className="wg-mono">{h.period.slice(-5)}</span>
                  <div className="wg-chart-cells">
                    {Array.from({ length: 10 }, (_, n) => (
                      <i key={n} className={n === h.number ? `is-hit wg-ball-${ballClass(n)}` : ''}>{n}</i>
                    ))}
                  </div>
                  <b className={sizeOf(h.number)}>{sizeOf(h.number) === 'big' ? 'B' : 'S'}</b>
                </div>
              ))}
            </div>
          )}

          {tab === 'mine' && (myRecords.length === 0 ? (
            <div className="wg-empty"><Icon name="inbox" size={28} strokeWidth={1.5} /><p>No settled bets in {r?.label ?? 'this room'} yet</p></div>
          ) : (
            <div className="wg-records">
              {myRecords.map((b) => (
                <div key={b.id} className="wg-record">
                  <span className={`wg-record-pick wg-chip-${/^\d$/.test(b.pick) ? ballClass(Number(b.pick)).split('-')[0] : b.pick}`}>
                    {/^\d$/.test(b.pick) ? b.pick : pickLabel(b.pick)[0]}
                  </span>
                  <div className="wg-record-main">
                    <strong>{pickLabel(b.pick)} · {money(b.amount)}</strong>
                    <span>{b.period} · drew {b.result} {sizeOf(b.result) === 'big' ? 'Big' : 'Small'}</span>
                  </div>
                  <strong className={b.status === 'won' ? 'is-won' : 'is-lost'}>
                    {b.status === 'won' ? `+${money(b.win)}` : `−${money(b.amount)}`}
                  </strong>
                </div>
              ))}
            </div>
          ))}
        </section>

        {rules && (
          <p className="wg-footnote">
            <Icon name="info" size={13} /> {rules.fee > 0 ? `${rules.fee}% service fee per bet · ` : ''}Bets ₹{inr(rules.minBet)}–₹{inr(rules.maxBet)} · betting closes {rules.lockMs / 1000}s before each draw
          </p>
        )}
      </main>

      {/* ── Bet sheet ──────────────────────────────────────── */}
      <div className={`wg-overlay ${sheet ? 'is-open' : ''}`} aria-hidden={!sheet}>
        <div className="wg-backdrop" onClick={() => setSheet(null)} />
        <div className="wg-sheet" role="dialog" aria-modal="true" aria-label="Place bet">
          {sheet && rules && (
            <>
              <div className={`wg-sheet-head is-${sheetTone}`}>
                <strong>{r?.label}</strong>
                <span>Select {pickLabel(sheet)} · pays {pickOdds(sheet, rules.payouts)}</span>
              </div>
              <div className="wg-sheet-body">
                <div className="wg-sheet-row">
                  <span>Balance</span>
                  <div className="wg-choices">
                    {BASES.map((b) => (
                      <button type="button" key={b} className={base === b ? `is-active is-${sheetTone}` : ''} onClick={() => setBase(b)}>{b}</button>
                    ))}
                  </div>
                </div>
                <div className="wg-sheet-row">
                  <span>Quantity</span>
                  <div className="wg-qty">
                    <button type="button" className={`is-${sheetTone}`} onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Less"><Icon name="minus" size={16} strokeWidth={2.6} /></button>
                    <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))} aria-label="Quantity" />
                    <button type="button" className={`is-${sheetTone}`} onClick={() => setQty((q) => q + 1)} aria-label="More"><Icon name="plus" size={16} strokeWidth={2.6} /></button>
                  </div>
                </div>
                <div className="wg-choices wg-choices-mults">
                  {MULTS.map((m) => (
                    <button type="button" key={m} className={qty === m ? `is-active is-${sheetTone}` : ''} onClick={() => setQty(m)}>X{m}</button>
                  ))}
                </div>
                {rules.fee > 0 && (
                  <p className="wg-sheet-fee">
                    {rules.fee}% service fee → {money(total * (1 - rules.fee / 100))} in play. Win pays {money(total * (1 - rules.fee / 100) * Number(pickOdds(sheet, rules.payouts).split('x')[0]))}
                    {sheet === 'green' || sheet === 'red' ? ` (${rules.payouts.colorSplit}x if ${sheet === 'green' ? '5' : '0'} is drawn)` : ''}.
                  </p>
                )}
              </div>
              <div className="wg-sheet-foot">
                <button type="button" className="wg-cancel" onClick={() => setSheet(null)}>Cancel</button>
                <button type="button" className={`wg-confirm is-${sheetTone}`} onClick={confirm} disabled={placing || locked}>
                  {placing ? 'Placing…' : `Total amount ${money(total)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── How to play ────────────────────────────────────── */}
      <div className={`wg-overlay wg-overlay-center ${rulesOpen ? 'is-open' : ''}`} aria-hidden={!rulesOpen}>
        <div className="wg-backdrop" onClick={() => setRulesOpen(false)} />
        {rulesOpen && rules && (
          <div className="wg-rules" role="dialog" aria-modal="true" aria-label="How to play">
            <h3>How to play</h3>
            <p>Each room draws one number from 0 to 9 when its timer ends ({ROOM_KEYS.map((k) => ROOM_TABS[k]).join(', ')}). Betting closes {rules.lockMs / 1000} seconds before the draw.</p>
            <ul>
              <li><b className="t-green">Green</b> wins on 1, 3, 7, 9 ({rules.payouts.color}x) and on 5 ({rules.payouts.colorSplit}x).</li>
              <li><b className="t-red">Red</b> wins on 2, 4, 6, 8 ({rules.payouts.color}x) and on 0 ({rules.payouts.colorSplit}x).</li>
              <li><b className="t-violet">Violet</b> wins on 0 or 5 ({rules.payouts.violet}x).</li>
              <li><b>Big</b> is 5–9, <b>Small</b> is 0–4 ({rules.payouts.size}x).</li>
              <li><b>Number</b>: pick the exact digit ({rules.payouts.number}x).</li>
            </ul>
            {rules.fee > 0 && <p>A {rules.fee}% service fee is taken from every bet; payouts are worked out on the rest. For example, ₹100 on Green → ₹{inr(100 - rules.fee)} in play → ₹{inr((100 - rules.fee) * rules.payouts.color)} if it wins.</p>}
            <p className="wg-rules-chances">
              This period's chances: {r?.chances.map((c, n) => `${n}: ${c}%`).join(' · ')}
            </p>
            <button type="button" className="wg-confirm is-red" onClick={() => setRulesOpen(false)}>Got it</button>
          </div>
        )}
      </div>

      {/* ── Result popup ───────────────────────────────────── */}
      {popup && (
        <div className="wg-popup-wrap" onClick={() => setPopup(null)}>
          <div className={`wg-popup ${popup.winnings > 0 ? 'is-win' : 'is-loss'}`}>
            <div className="wg-popup-top">
              <Icon name={popup.winnings > 0 ? 'trophy' : 'circleAlert'} size={34} strokeWidth={1.8} />
              <strong>{popup.winnings > 0 ? 'Congratulations' : 'Sorry'}</strong>
            </div>
            <div className="wg-popup-result">
              <span>Lottery results</span>
              <div>
                {colorsOf(popup.number).map((c) => <em key={c} className={`wg-tag-${c}`}>{c}</em>)}
                <Ball n={popup.number} size="is-sm" />
                <em className="wg-tag-size">{sizeOf(popup.number) === 'big' ? 'Big' : 'Small'}</em>
              </div>
            </div>
            <div className="wg-popup-amount">
              <span>{popup.winnings > 0 ? 'Bonus' : 'Staked'}</span>
              <strong>{popup.winnings > 0 ? money(popup.winnings) : money(popup.staked)}</strong>
              <small>{popup.label} · period {popup.period}</small>
            </div>
          </div>
        </div>
      )}

      <div className="wg-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`wg-toast wg-toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'circleCheck' : t.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
