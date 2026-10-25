import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './MoneyWheel.css'

// fallback (server sends the real layout via rules.wheel)
const FALLBACK_WHEEL = Array.from({ length: 54 }, (_, i) => ({ spot: i % 6 === 0 ? 'x2' : 'x1', mult: i % 6 === 0 ? 3 : 2 }))

const SPOT_META = {
  x1: { label: '1', pay: '2×', color: '#f59e0b', text: '#3b2100' },
  x2: { label: '2', pay: '3×', color: '#3b82f6', text: '#fff' },
  x5: { label: '5', pay: '6×', color: '#8b5cf6', text: '#fff' },
  x10: { label: '10', pay: '11×', color: '#ef4444', text: '#fff' },
  x20: { label: '20', pay: '21×', color: '#ec4899', text: '#fff' },
  joker: { label: 'J', pay: '41×', color: '#10b981', text: '#03231a' },
}

const SEG_ANGLE = 360 / 54 // 6.67° per segment

export default function MoneyWheel() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [spot, setSpot] = useState('x2')
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [pointerIndex, setPointerIndex] = useState(0)
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0
  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/money-wheel/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const wheel = rules?.wheel?.length === rules?.total
    ? rules.wheel
    : (rules?.wheel ?? FALLBACK_WHEEL)
  const segCount = wheel.length

  const spin = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    setSpinning(true)
    setResult(null)
    try {
      const res = await api.post('/games/money-wheel/spin', { spot, amount })
      const b = res.data.history?.[0]
      // spin the wheel 6 extra turns and land on the drawn segment under the pointer (top)
      const fullTurns = 6 * segCount
      const target = fullTurns + ((segCount - (b?.index ?? 0)) % segCount)
      setPointerIndex(target)
      setTimeout(() => {
        setSpinning(false)
        setBusy(false)
        setResult({ landed: b?.landedSpot, win: b?.win, amount: b?.amount })
        setHistory(res.data.history)
        if (b) {
          const meta = SPOT_META[b.landedSpot]
          showToast(b.win > 0 ? 'success' : 'error',
            b.win > 0
              ? `${meta?.label ?? b.landedSpot} — won ${money(b.win)}!`
              : `Landed on ${meta?.label ?? b.landedSpot} — lost`)
        }
        refreshWallet().catch(() => {})
      }, 1700)
    } catch (e) {
      setSpinning(false)
      setBusy(false)
      showToast('error', e.response?.data?.error || 'Spin failed')
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  // purely visual: disc paint from the exact segment ladder + landing rotation
  const wheelStops = wheel.map((seg, i) => {
    const meta = SPOT_META[seg.spot] ?? SPOT_META.x1
    return `${meta.color} ${i * SEG_ANGLE}deg ${(i + 1) * SEG_ANGLE}deg`
  }).join(', ')
  const wheelBg = `conic-gradient(from -${SEG_ANGLE / 2}deg, ${wheelStops})`

  const last = history[0]
  const bestWin = history.reduce((m, b) => Math.max(m, b.win), 0)
  const selMeta = SPOT_META[spot] ?? SPOT_META.x1
  const landMeta = result ? (SPOT_META[result.landedSpot] ?? SPOT_META.x1) : null

  // disc paints segment i centred at +i·SEG (clockwise). Landing needs θ ≡ −idx·SEG:
  // spin phase uses the full target (+6 extra turns); idle collapses it mod 360 (invisible)
  const rotation = spinning
    ? pointerIndex * SEG_ANGLE
    : (pointerIndex % segCount) * SEG_ANGLE + 360 * (Math.floor(pointerIndex / segCount) % 2)

  return (
    <GameShell
      icon="star"
      title="Money Wheel"
      tagline="Big Six spins"
      accent="#7c5cff"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      wide={true}
      footer={(
        <div className="mw-dock">
          <div className="mw-spots">
            {Object.entries(SPOT_META).map(([id, m]) => (
              <button key={id} type="button" className={`gs-chip mw-spot ${spot === id ? 'is-on' : ''}`} style={{ '--cc': m.color }} onClick={() => setSpot(id)}>
                <span className="mw-spot-dot" style={{ background: m.color, color: m.text }}>{m.label}</span>
                <em>{m.pay}</em>
              </button>
            ))}
          </div>

          <div className="gs-input-row">
            <div className="gs-field">
              <span className="gs-cur">₹</span>
              <input
                className="gs-input"
                type="number"
                min={minBet}
                max={maxBet}
                value={stake}
                onChange={e => setStake(e.target.value)}
                inputMode="decimal"
                aria-label="Stake"
              />
            </div>
            <button type="button" className="gs-chip" onClick={halfStake}>1/2</button>
            <button type="button" className="gs-chip" onClick={doubleStake}>2×</button>
            <button type="button" className="gs-chip" onClick={maxStake}>MAX</button>
          </div>

          <div className="gs-quick">
            {[10, 50, 100, 500].filter(v => v >= minBet && v <= maxBet).map(v => (
              <button key={v} type="button" className="gs-chip" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>

          <button type="button" className="gs-cta" onClick={spin} disabled={busy}>
            <Icon name={spinning ? 'refresh' : 'play'} size={17} strokeWidth={2.6} />
            {spinning ? 'SPINNING…' : 'SPIN THE WHEEL'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage mw-stage">
        <div className="mw-spotlight" aria-hidden="true" />
        <div className="mw-scene">
          <div className={`mw-wheelwrap ${spinning ? 'is-spinning' : ''}`}>
            <span className="mw-pointer" aria-hidden="true" />
            <div className="mw-plate-holder">
              <div
                className="mw-plate"
                style={{
                  background: wheelBg,
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? 'transform 1.62s cubic-bezier(0.12, 0.74, 0.12, 1)' : 'none',
                }}
              >
                {wheel.map((seg, i) => {
                  const meta = SPOT_META[seg.spot] ?? SPOT_META.x1
                  return (
                    <span key={i} className="mw-segwrap" style={{ '--ca': `${i * SEG_ANGLE}deg` }}>
                      <i className="mw-seg" style={{ color: meta.text }}>{meta.label}</i>
                    </span>
                  )
                })}
              </div>
              <span className="mw-hub" aria-hidden="true" />
            </div>
          </div>

          <div className="mw-teller">
            <div className="mw-landed">
              {landMeta ? (
                <>
                  <span className="mw-landed-coin" style={{ background: landMeta.color, color: landMeta.text }}>{landMeta.label}</span>
                  <span className="mw-landed-mult">{landMeta.pay}</span>
                </>
              ) : (
                <>
                  <span className="mw-landed-coin idle">?</span>
                  <span className="mw-landed-mult">{spinning ? 'SPINNING' : 'READY'}</span>
                </>
              )}
            </div>
            {result && (
              <div className={`gs-banner ${result.win > result.amount ? 'win' : result.win > 0 ? 'push' : 'loss'}`}>
                {result.win > result.amount
                  ? `Won ${money(result.win)}!`
                  : result.win > 0
                    ? `Returned ${money(result.win)}`
                    : 'No luck — try again'}
              </div>
            )}
            <p className="mw-note">Betting on <strong style={{ color: selMeta.color }}>{selMeta.label}</strong> pays <strong>{selMeta.pay}</strong></p>
          </div>
        </div>
      </section>

      <div className="gs-strip">
        {history.slice(0, 16).map(b => {
          const m = SPOT_META[b.landedSpot] ?? SPOT_META.x1
          return (
            <span key={b.id} className="gs-pill mw-pill" style={{ background: m.color, color: m.text, borderColor: 'transparent' }}>
              {m.label}
            </span>
          )
        })}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{last ? (SPOT_META[last.landedSpot] ?? SPOT_META.x1).label : '—'}</b>
          <span>Last landed</span>
        </div>
        <div className="gs-stat">
          <b>{bestWin > 0 ? money(bestWin) : '—'}</b>
          <span>Best win</span>
        </div>
        <div className="gs-stat">
          <b>{selMeta.pay}</b>
          <span>{selMeta.label} pays</span>
        </div>
      </div>

      <section className="gs-panel gs-hist mw-hist">
        <div className="gs-panel-title">Recent spins</div>
        {history.length ? (
          history.slice(0, 15).map(b => {
            const bet = SPOT_META[b.spot] ?? SPOT_META.x1
            const land = SPOT_META[b.landedSpot] ?? SPOT_META.x1
            return (
              <div key={b.id} className="gs-hist-row">
                <span className="mw-hist-spot" style={{ background: bet.color, color: bet.text }}>{bet.label}</span>
                <span className="mw-hist-land">→ <i style={{ color: land.color, borderColor: land.color }}>{land.label}</i></span>
                <span className="mw-hist-stake">{money(b.amount)}</span>
                <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
                <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )
          })
        ) : <p className="gs-hist-empty">No spins yet — pick your spot</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Bet on one spot: <strong>1</strong>, <strong>2</strong>, <strong>5</strong>, <strong>10</strong>, <strong>20</strong> or the <strong>Joker</strong></li>
          <li>54 segments: 1 is most common, Joker rarest</li>
          <li>Land on your spot → paid <strong>2× up to 41×</strong> the stake</li>
          <li>Every spin is a fresh, fair result</li>
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
