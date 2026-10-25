import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { useSiteConfig } from '../../lib/siteConfig'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import './Keno.css'

const ROOM_ORDER = ['30s', '1m', '3m', '5m']
const ROOM_LABELS = { '30s': '30s', '1m': '1m', '3m': '3m', '5m': '5m' }
const ROOM_DESC = { '30s': 'Every 30 seconds', '1m': 'Every minute', '3m': 'Every 3 min', '5m': 'Every 5 min' }

function pickCountLabel(n) {
  return n === 1 ? 'Pick 1' : n === 2 ? 'Pick 2' : `Pick ${n}`
}

function countMatches(picks, drawn) {
  if (!drawn) return null
  const drawnSet = new Set(drawn)
  return picks.filter(n => drawnSet.has(n)).length
}

export default function Keno() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState('30s')
  const [picks, setPicks] = useState([])
  const [amount, setAmount] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const [showPaytable, setShowPaytable] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [lastDraw, setLastDraw] = useState(null)
  const drawAnimRef = useRef(null)

  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2400)
  }

  const refresh = async () => {
    setSpinning(true)
    await Promise.all([fetchState(), refreshWallet().catch(() => {}), new Promise(r => setTimeout(r, 600))])
    setSpinning(false)
  }

  const fetchState = async () => {
    const res = await api.get('/games/keno/state')
    setState(res.data)
  }

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000)
    return () => clearInterval(interval)
  }, [])

  // Handle draw animation
  useEffect(() => {
    if (!state) return
    const pending = state.pending?.[0]
    const settled = state.settled?.[0]
    if (settled && settled.drawn && (!lastDraw || lastDraw.period !== settled.period || lastDraw.room !== settled.room)) {
      setLastDraw({ room: settled.room, period: settled.period, numbers: settled.drawn })
      setAnimating(true)
      drawAnimRef.current = setTimeout(() => setAnimating(false), 3000)
    }
  }, [state])

  const togglePick = (num) => {
    setPicks(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num)
      if (prev.length >= 10) return prev
      return [...prev, num].sort((a, b) => a - b)
    })
  }

  const clearPicks = () => setPicks([])
  const quickPick = (count) => {
    const available = Array.from({ length: 80 }, (_, i) => i + 1).filter(n => !picks.includes(n))
    const shuffled = available.sort(() => Math.random() - 0.5)
    setPicks([...picks, ...shuffled.slice(0, Math.max(0, count - picks.length))].sort((a, b) => a - b).slice(0, 10))
  }

  const handleBet = async () => {
    if (picks.length === 0) return showToast('error', 'Pick at least 1 number')
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    const roomConfig = state?.rules?.rooms?.find(r => r.key === selectedRoom)
    if (!roomConfig?.enabled) return showToast('error', 'This room is closed')

    try {
      const res = await api.post('/games/keno/bet', { room: selectedRoom, picks, amount: paise / 100 })
      setState(res.data)
      setAmount('')
      setPicks([])
      showToast('success', `Bet placed on ${ROOM_LABELS[selectedRoom]} draw`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Bet failed')
    }
  }

  const getMultiplier = (pickCount, matches) => {
    const table = state?.rules?.paytable?.[pickCount]
    return table?.[matches] ?? 0
  }

  const getPotentialWin = () => {
    if (picks.length === 0 || !amount) return 0
    const paise = Math.round(parseFloat(amount) * 100)
    const maxMult = Math.max(...(state?.rules?.paytable?.[picks.length] ?? [0]))
    return Math.min(paise * maxMult, state?.rules?.maxWin * 100)
  }

  const formatTimeLeft = (room, serverNow) => {
    const roomConfig = ROOM_LABELS[room]
    if (!roomConfig) return ''
    const { intervalMs } = { '30s': 30000, '1m': 60000, '3m': 180000, '5m': 300000 }[room]
    const currentPeriod = Math.floor(serverNow / intervalMs)
    const periodEndMs = (currentPeriod + 1) * intervalMs
    const left = periodEndMs - serverNow
    if (left <= 0) return 'Drawing...'
    const secs = Math.ceil(left / 1000)
    return `${secs}s`
  }

  const numbers = useMemo(() => Array.from({ length: 80 }, (_, i) => i + 1), [])

  const roomConfig = state?.rules?.rooms?.find(r => r.key === selectedRoom)
  const isLocked = roomConfig && state?.serverNow && (state.serverNow >= (Math.floor(state.serverNow / roomConfig.intervalMs) + 1) * roomConfig.intervalMs - (state.rules.lockSeconds * 1000))

  return (
    <div className="keno-root">
      <header className="keno-header">
        <div className="keno-title">
          <Icon name="grid" size={22} strokeWidth={2.2} />
          <span>Keno</span>
        </div>
        <div className="keno-balance">
          <span>₹{money(balance)}</span>
          <button className={`keno-refresh ${spinning ? 'spin' : ''}`} onClick={refresh} disabled={spinning} aria-label="Refresh">
            <Icon name="refresh" size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="keno-main">
        {/* Room tabs */}
        <div className="keno-rooms" role="tablist">
          {ROOM_ORDER.map(key => {
            const rc = state?.rules?.rooms?.find(r => r.key === key)
            if (!rc) return null
            return (
              <button
                key={key}
                role="tab"
                aria-selected={selectedRoom === key}
                className={`keno-room-tab ${selectedRoom === key ? 'active' : ''} ${!rc.enabled ? 'disabled' : ''}`}
                onClick={() => rc.enabled && setSelectedRoom(key)}
                disabled={!rc.enabled}
              >
                <span className="keno-room-label">{ROOM_LABELS[key]}</span>
                <span className="keno-room-desc">{ROOM_DESC[key]}</span>
                <span className={`keno-timer ${isLocked && selectedRoom === key ? 'locked' : ''}`}>
                  {state?.serverNow ? formatTimeLeft(key, state.serverNow) : '—'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Number grid */}
        <div className="keno-grid-wrap">
          <div className="keno-pick-info">
            <span>Selected: <strong>{picks.length}</strong> / 10</span>
            <span>Potential: <strong>₹{money(getPotentialWin() / 100)}</strong></span>
          </div>
          <div className="keno-grid" role="grid" aria-label="Keno numbers 1-80">
            {numbers.map(n => (
              <button
                key={n}
                type="button"
                role="gridcell"
                aria-selected={picks.includes(n)}
                className={`keno-num ${picks.includes(n) ? 'picked' : ''} ${lastDraw?.numbers?.includes(n) ? 'hit' : ''}`}
                onClick={() => !isLocked && togglePick(n)}
                disabled={isLocked || (picks.length >= 10 && !picks.includes(n))}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="keno-quick-pick">
            <button type="button" onClick={clearPicks} disabled={picks.length === 0}>Clear</button>
            <button type="button" onClick={() => quickPick(5)} disabled={picks.length >= 5}>Pick 5</button>
            <button type="button" onClick={() => quickPick(10)} disabled={picks.length >= 10}>Pick 10</button>
          </div>
        </div>

        {/* Bet input */}
        <div className="keno-bet">
          <label>Bet Amount (₹)</label>
          <div className="keno-input-row">
            <input
              type="number"
              step="10"
              min={state?.rules?.minBet || 1}
              max={state?.rules?.maxBet || 100000}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              inputMode="decimal"
              disabled={isLocked}
            />
            <button type="button" className="keno-btn-bet" onClick={handleBet} disabled={picks.length === 0 || !amount || isLocked}>
              <Icon name="play" size={16} strokeWidth={2.5} /> PLACE BET
            </button>
          </div>
          <div className="keno-quick-bets">
            {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 1) && v <= (state?.rules?.maxBet || 100000)).map(v => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} disabled={isLocked}>₹{v}</button>
            ))}
          </div>
        </div>

        {/* Pending bets */}
        {state?.pending?.length > 0 && (
          <div className="keno-pending">
            <h3>Pending Draws</h3>
            {state.pending.map(b => (
              <div key={b.id} className="keno-pending-item">
                <div className="keno-pending-picks">
                  {b.picks.map(n => <span key={n} className="keno-pending-num">{n}</span>)}
                </div>
                <div className="keno-pending-meta">
                  <span>{ROOM_LABELS[b.room]}</span>
                  <span>₹{money(b.amount)}</span>
                  <span className="keno-pending-timer">
                    {state?.serverNow ? formatTimeLeft(b.room, state.serverNow) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Last draw animation */}
        {animating && lastDraw && (
          <div className="keno-draw-anim" role="status" aria-live="polite">
            <div className="keno-draw-header">
              <span>{ROOM_LABELS[lastDraw.room]} Draw</span>
              <span>Period #{lastDraw.period}</span>
            </div>
            <div className="keno-draw-numbers">
              {lastDraw.numbers.map((n, i) => (
                <span key={n} className="keno-draw-num" style={{ animationDelay: `${i * 80}ms` }}>{n}</span>
              ))}
            </div>
          </div>
        )}

        {/* Rules & paytable */}
        <details className="keno-rules">
          <summary onClick={e => { e.preventDefault(); setShowPaytable(!showPaytable) }}>
            {showPaytable ? 'Hide Paytable' : 'Show Paytable & Rules'}
          </summary>
          {showPaytable && (
            <div className="keno-paytable">
              <div className="keno-paytable-header">
                <span>Pick</span>
                {Array.from({ length: 11 }, (_, i) => i).map(m => <span key={m}>{m === 0 ? '—' : m}</span>)}
              </div>
              {Object.entries(state?.rules?.paytable ?? {}).map(([pick, row]) => (
                <div key={pick} className="keno-paytable-row">
                  <span className="keno-paytable-pick">{pickCountLabel(parseInt(pick))}</span>
                  {row.map((mult, i) => (
                    <span key={i} className={i === 0 ? 'keno-paytable-miss' : ''}>{mult > 0 ? mult + 'x' : '—'}</span>
                  ))}
                </div>
              ))}
              <p className="keno-paytable-note">* Service fee deducted from stake. Max win: ₹{money(state?.rules?.maxWin)}</p>
            </div>
          )}
          {!showPaytable && (
            <ul>
              <li>Pick <strong>1–10 numbers</strong> from 1–80</li>
              <li><strong>20 numbers</strong> are drawn each round</li>
              <li>Payout depends on how many you <strong>match</strong></li>
              <li>Choose draw speed: <strong>30s, 1m, 3m, 5m</strong></li>
              <li>Betting locks <strong>{state?.rules?.lockSeconds ?? 5}s</strong> before draw</li>
            </ul>
          )}
        </details>

        {/* History */}
        <div className="keno-history">
          <h3>Recent Results</h3>
          {state?.settled?.length ? (
            <div className="keno-history-list">
              {state.settled.slice(0, 15).map(b => (
                <div key={b.id} className="keno-history-item">
                  <div className="keno-hist-picks">
                    {b.picks.map(n => (
                      <span key={n} className={`keno-hist-num ${b.drawn?.includes(n) ? 'hit' : ''}`}>{n}</span>
                    ))}
                  </div>
                  <div className="keno-hist-meta">
                    <span>{ROOM_LABELS[b.room]}</span>
                    <span>₹{money(b.amount)}</span>
                    <span className={b.status === 'won' ? 'win' : 'lose'}>
                      {b.status === 'won' ? `+${money(b.win)} (${b.matches}/{b.picks.length})` : `Lost (${b.matches}/{b.picks.length})`}
                    </span>
                    <span className="keno-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="keno-empty">No results yet</p>
          )}
        </div>
      </main>

      <BottomNav onSoon={text => showToast('info', text)} />

      {toast && (
        <div key={toast.id} className={`keno-toast keno-toast-${toast.kind}`} role="status">
          <Icon name={toast.kind === 'success' ? 'circleCheck' : toast.kind === 'error' ? 'circleAlert' : 'info'} size={16} />
          {toast.text}
        </div>
      )}

      <Popup
        open={lowBalance}
        tone="warn"
        icon="wallet"
        kicker="Minimum balance"
        title="Add money to play"
        onClose={() => setLowBalance(false)}
        actions={[
          { label: 'Deposit now', primary: true, onClick: () => navigate('/deposit') },
          { label: 'Not now', onClick: () => setLowBalance(false) },
        ]}
      >
        You need at least <strong>₹{money(minPlay)}</strong> in your wallet to play.
        Your balance is <strong>₹{money(balance)}</strong>.
      </Popup>
    </div>
  )
}