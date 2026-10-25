import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './Roulette.css'

const FALLBACK_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

const OUTSIDE_LABELS = {
  red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36',
  dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12', col1: 'Col 1', col2: 'Col 2', col3: 'Col 3',
}
const OUTSIDE_PAYS = { red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, dozen1: 3, dozen2: 3, dozen3: 3, col1: 3, col2: 3, col3: 3 }

const CHIPS = [
  { v: 20, c: '#3b82f6' },
  { v: 50, c: '#22c55e' },
  { v: 100, c: '#f59e0b' },
  { v: 500, c: '#ef4444' },
]

// table order: 0 spans the left column; numbers 1–36 read left→right in 12 columns of 3
const COLUMNS = Array.from({ length: 12 }, (_, col) => [1 + col * 3, 2 + col * 3, 3 + col * 3])

// European wheel pocket order — purely decorative (equal-weight visual, odds per server)
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const ORDER_SEG = 360 / ORDER.length

export default function Roulette() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [bets, setBets] = useState({}) // key → stake (paise as rupees number)
  const [chip, setChip] = useState(50)
  const [busy, setBusy] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const [wheelAngle, setWheelAngle] = useState(0) // purely visual derived state
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/roulette/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const redNums = new Set(rules?.red ?? FALLBACK_RED)
  const colorOf = (n) => (n === 0 ? 'green' : redNums.has(n) ? 'red' : 'black')

  // rotate the disc so the winning pocket parks under the top pointer,
  // always spun forward with 4 extra turns
  const planSpin = (pocket) => {
    const idx = ORDER.indexOf(Number(pocket))
    if (idx < 0) return wheelAngle
    const center = (idx + 0.5) * ORDER_SEG
    const target = ((-center % 360) + 360) % 360
    const from = ((wheelAngle % 360) + 360) % 360
    return wheelAngle + 1440 + ((target - from) + 360) % 360
  }

  const place = (key) => {
    if (busy || spinning) return
    setBets(b => ({ ...b, [key]: (b[key] ?? 0) + chip }))
  }

  const undo = () => {
    setBets(b => {
      const keys = Object.keys(b)
      if (!keys.length) return b
      const key = keys[keys.length - 1]
      const next = { ...b }
      if (next[key] <= chip) delete next[key]
      else next[key] = next[key] - chip
      return next
    })
  }

  const totalStake = Object.values(bets).reduce((a, b) => a + b, 0)
  const spotCount = Object.keys(bets).length

  const spin = async () => {
    if (busy || spinning) return
    if (!spotCount) return showToast('error', 'Place at least one bet')
    if (totalStake < (rules?.minBet ?? 10)) return showToast('error', `Minimum bet is ${money(rules?.minBet ?? 10)}`)
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    setSpinning(true)
    setResult(null)
    try {
      const payload = {
        bets: Object.entries(bets).map(([key, stakeValue]) => {
          if (key.startsWith('n-')) return { type: 'number', pick: Number(key.slice(2)), stake: stakeValue }
          return { type: key, stake: stakeValue }
        }),
      }
      const res = await api.post('/games/roulette/spin', payload)
      const b = res.data.history?.[0]
      if (b) setWheelAngle(planSpin(b.pocket)) // visual only — bets/payouts untouched
      setTimeout(() => {
        setSpinning(false)
        setBusy(false)
        setResult({ pocket: b?.pocket, color: b?.color, win: b?.win, amount: b?.amount })
        setBets({})
        setHistory(res.data.history)
        if (b) {
          showToast(b.win > b.amount ? 'success' : b.win > 0 ? 'info' : 'error',
            b.win > b.amount
              ? `Landed on ${b.pocket} — won ${money(b.win)}!`
              : b.win > 0
                ? `Landed on ${b.pocket} — returned ${money(b.win)}`
                : `Landed on ${b.pocket} — no luck`)
        }
        refreshWallet().catch(() => {})
      }, 1100)
    } catch (e) {
      setSpinning(false)
      setBusy(false)
      showToast('error', e.response?.data?.error || 'Spin failed')
    }
  }

  const clear = () => setBets({})

  const stakeOf = (key) => bets[key]
  const showChip = (key) => stakeOf(key) ? <span className={`rl-chip c${CHIPS.find(x => x.v === stakeOf(key))?.v ?? 100}`}>{stakeOf(key) >= 1000 ? `${Math.round(stakeOf(key) / 100) / 10}k` : stakeOf(key)}</span> : null

  const discPaint = `conic-gradient(${ORDER.map((n, i) => `${colorOf(n)} ${i * ORDER_SEG}deg ${(i + 1) * ORDER_SEG}deg`).join(', ')})`

  return (
    <GameShell
      icon="wheel"
      title="Roulette"
      tagline="Single-zero wheel"
      accent="#ff4655"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      wide={true}
      footer={(
        <div className="rl-dock">
          <div className="rl-chiprow">
            {CHIPS.map(c => (
              <button key={c.v} type="button" className={`gs-chip rl-chip-pick ${chip === c.v ? 'is-on' : ''}`} style={{ '--cc': c.c }} onClick={() => setChip(c.v)}>
                {c.v}
              </button>
            ))}
            <span className="rl-staked">Total <strong>{money(totalStake)}</strong></span>
          </div>
          <div className="rl-dockrow">
            <button type="button" className="gs-btn-ghost rl-ghost" onClick={undo} disabled={!spotCount}>
              <Icon name="rotateCcw" size={15} strokeWidth={2.3} />
              Undo
            </button>
            <button type="button" className="gs-btn-ghost rl-ghost" onClick={clear} disabled={!spotCount}>
              <Icon name="x" size={15} strokeWidth={2.3} />
              Clear
            </button>
          </div>
          <button type="button" className="gs-cta" onClick={spin} disabled={busy || !spotCount}>
            <Icon name={spinning ? 'refresh' : 'play'} size={17} strokeWidth={2.6} />
            {spinning ? 'SPINNING…' : 'SPIN THE WHEEL'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage rl-stage">
        <div className="rl-spotlight" aria-hidden="true" />
        <div className="rl-wheelwrap">
          <span className="rl-pointer" aria-hidden="true" />
          <div className="rl-disc-holder">
            <div className="rl-disc" style={{ background: discPaint, transform: `rotate(${wheelAngle}deg)` }} aria-hidden="true">
              {ORDER.map((n, i) => (
                <span key={n} className="rl-slotwrap" style={{ '--wa': `${(i + 0.5) * ORDER_SEG}deg` }}>
                  <i className="rl-slotnum">{n}</i>
                </span>
              ))}
            </div>
            <span className="rl-disc-hub" aria-hidden="true" />
            <div className={`rl-pocket ${result ? `c-${result.color}` : 'idle'}`}>
              {result ? result.pocket : spinning ? '…' : '?'}
            </div>
          </div>
        </div>
        <span className="rl-wheel-hint">single zero · 37 pockets</span>
        {result && (
          <div className={`gs-banner ${result.win > result.amount ? 'win' : result.win > 0 ? 'push' : 'loss'}`}>
            {result.win > result.amount
              ? `Landed on ${result.pocket} (${result.color}) — won ${money(result.win)}!`
              : result.win > 0
                ? `Landed on ${result.pocket} (${result.color}) — returned ${money(result.win)}`
                : `Landed on ${result.pocket} (${result.color}) — no luck`}
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 18).map(b => (
          <span key={b.id} className={`gs-pill rl-pill c-${b.color}`}>{b.pocket}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="rl-chips">
        {CHIPS.map(c => (
          <button key={c.v} type="button" className={`gs-chip rl-chip-pick ${chip === c.v ? 'is-on' : ''}`} style={{ '--cc': c.c }} onClick={() => setChip(c.v)}>
            {c.v}
          </button>
        ))}
        <span className="rl-staked-grow">Select a chip, tap the felt</span>
        <span className="rl-staked">Total <strong>{money(totalStake)}</strong></span>
      </div>

      <section className="gs-panel rl-table">
        <div className="gs-panel-title">Betting felt</div>
        <div className="rl-board">
          <button type="button" className="rl-cell rl-zero" onClick={() => place('n-0')}>
            0{showChip('n-0')}
          </button>
          <div className="rl-grid">
            {[2, 1, 0].map(row => (
              <div key={row} className="rl-row">
                {COLUMNS.map((col, i) => {
                  const n = col[row]
                  return (
                    <button key={i} type="button" className={`rl-cell c-${colorOf(n)}`} onClick={() => place(`n-${n}`)}>
                      {n}{showChip(`n-${n}`)}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="rl-dozens">
          {['dozen1', 'dozen2', 'dozen3'].map(k => (
            <button key={k} type="button" className="rl-outside" onClick={() => place(k)}>{OUTSIDE_LABELS[k]}{showChip(k)}</button>
          ))}
        </div>
        <div className="rl-half">
          {['low', 'even', 'red', 'black', 'odd', 'high'].map(k => (
            <button key={k} type="button" className={`rl-outside ${k === 'red' ? 'is-red' : k === 'black' ? 'is-black' : ''}`} onClick={() => place(k)}>
              {OUTSIDE_LABELS[k]}{showChip(k)}
            </button>
          ))}
        </div>
        <div className="rl-cols">
          {['col1', 'col2', 'col3'].map(k => (
            <button key={k} type="button" className="rl-outside small" onClick={() => place(k)}>{OUTSIDE_LABELS[k]}{showChip(k)}</button>
          ))}
        </div>

        <div className="rl-pays">
          <span>Number <strong>35:1</strong></span>
          <span>Red/Black, Odd/Even, 1-18/19-36 <strong>1:1</strong></span>
          <span>Dozen, Column <strong>2:1</strong></span>
        </div>
      </section>

      <section className="gs-panel gs-hist rl-hist">
        <div className="gs-panel-title">Recent spins</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={`rl-hist-pocket c-${b.color}`}>{b.pocket}</span>
              <span className="rl-hist-stake">{money(b.amount)}</span>
              <span className={b.win > b.amount ? 'win' : b.win > 0 ? 'push' : 'lose'}>
                {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.win > 0 ? `${money(b.win)}` : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No spins yet — place your chips</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Pick a chip, tap <strong>numbers</strong> or the <strong>outside bets</strong> to stack stakes</li>
          <li>Straight number pays <strong>35:1</strong> · Red/Black, Odd/Even, 1-18/19-36 pay <strong>1:1</strong></li>
          <li>Dozen and Column bets pay <strong>2:1</strong></li>
          <li>Single zero — 37 pockets per spin</li>
        </ul>
      </details>

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
        You need at least <strong>{money(minPlay)}</strong> in your wallet to play.
        Your balance is <strong>{money(balance)}</strong>.
      </Popup>
    </GameShell>
  )
}
