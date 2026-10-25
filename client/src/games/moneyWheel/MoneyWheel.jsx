import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
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

  const rotation = spinning ? -pointerIndex * SEG_ANGLE : -(pointerIndex % segCount) * SEG_ANGLE + 360 * (Math.floor(pointerIndex / segCount) % 2)
  const last = history[0]

  return (
    <div className="mw-root">
      <header className="mw-header">
        <div className="mw-title"><Icon name="wheel" size={22} strokeWidth={2.2} /><span>Money Wheel</span></div>
        <div className="mw-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="mw-main">
        <section className="mw-stage">
          <div className="mw-pointer" />
          <div className="mw-plate" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 1.6s cubic-bezier(0.15, 0.85, 0.2, 1)' : 'none' }}>
            {wheel.map((seg, i) => {
              const meta = SPOT_META[seg.spot] ?? SPOT_META.x1
              return (
                <span
                  key={i}
                  className="mw-seg"
                  style={{
                    '--ca': `${i * SEG_ANGLE}deg`,
                    background: meta.color,
                    color: meta.text,
                  }}
                >
                  {meta.label}
                </span>
              )
            })}
            <span className="mw-hub" />
          </div>
          {result && (
            <div className={`mw-callout ${result.win > result.amount ? 'is-win' : result.win > 0 ? 'is-push' : 'is-loss'}`}>
              {result.win > result.amount
                ? `Won ${money(result.win)}!`
                : result.win > 0
                  ? `Returned ${money(result.win)}`
                  : 'No luck — try again'}
            </div>
          )}
        </section>

        <section className="mw-spots">
          {Object.entries(SPOT_META).map(([id, m]) => (
            <button key={id} type="button" className={`mw-spot ${spot === id ? 'active' : ''}`} style={{ '--cc': m.color }} onClick={() => setSpot(id)}>
              <span className="mw-spot-label">{m.label}</span>
              <em>{m.pay}</em>
            </button>
          ))}
        </section>

        <section className="mw-controls">
          <label className="mw-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="mw-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="mw-spin" onClick={spin} disabled={busy}>
            {spinning ? 'SPINNING…' : 'SPIN THE WHEEL'}
          </button>
        </section>

        <details className="mw-rules">
          <summary>How to play</summary>
          <ul>
            <li>Bet on one spot: <strong>1</strong>, <strong>2</strong>, <strong>5</strong>, <strong>10</strong>, <strong>20</strong> or the <strong>Joker</strong></li>
            <li>54 segments: 1 is most common, Joker rarest</li>
            <li>Land on your spot → paid <strong>2× up to 41×</strong> the stake</li>
            <li>Every spin is a fresh, fair result</li>
          </ul>
        </details>

        <div className="mw-history">
          <h3>Recent spins</h3>
          {history.length ? (
            <div className="mw-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="mw-hist-item">
                  <span className="mw-hist-spot" style={{ background: (SPOT_META[b.spot] ?? SPOT_META.x1).color, color: (SPOT_META[b.spot] ?? SPOT_META.x1).text }}>
                    {(SPOT_META[b.spot] ?? SPOT_META.x1).label}
                  </span>
                  <span>→ {(SPOT_META[b.landedSpot] ?? SPOT_META.x1).label}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
                  <span className="mw-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="mw-empty">No spins yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`mw-toast mw-toast-${toast.kind}`} role="status">
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
        You need at least <strong>{money(minPlay)}</strong> in your wallet to play.
        Your balance is <strong>{money(balance)}</strong>.
      </Popup>
    </div>
  )
}
