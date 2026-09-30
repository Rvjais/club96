import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet'
import { api } from '../lib/api'
import { useAuth } from '../auth/authContext'
import { createWheelAudio } from '../games/wheel/wheelAudio'
import './LuckySpin.css'

const SPIN_MS = 4600
// Same colours as the admin preview (admin/src/pages/settings/SpinSettings.jsx)
const COLORS = ['#e02020', '#ff9800', '#f5b700', '#22a55e', '#1e88e5', '#8e44ad', '#ec4899', '#14b8a6']
const ZERO = '#94a3b8'
const inr = (n) => Number(n).toLocaleString('en-IN')
const ease = (t) => 1 - (1 - t) ** 3.4 // close to the CSS curve, used for tick sounds

/** SVG path for one pie slice, angles in degrees clockwise from 12 o'clock. */
function slice(a0, a1, r) {
  const p = (a) => {
    const rad = ((a - 90) * Math.PI) / 180
    return `${(100 + r * Math.cos(rad)).toFixed(3)} ${(100 + r * Math.sin(rad)).toFixed(3)}`
  }
  return `M 100 100 L ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)} Z`
}

function WheelSvg({ prizes }) {
  const seg = 360 / prizes.length
  return (
    <svg viewBox="0 0 200 200" className="ls-svg" aria-hidden="true">
      {prizes.map((amount, i) => (
        <path key={i} d={slice(i * seg, (i + 1) * seg, 96)} fill={amount > 0 ? COLORS[i % COLORS.length] : ZERO} stroke="#fff" strokeWidth="1.5" />
      ))}
      {prizes.map((amount, i) => {
        const a = (i + 0.5) * seg
        return (
          <text key={`t${i}`} x="100" y="30" transform={`rotate(${a} 100 100)`} textAnchor="middle" className="ls-label">
            {amount > 0 ? `₹${inr(amount)}` : 'Try again'}
          </text>
        )
      })}
    </svg>
  )
}

/** Bottom-bar Lucky Spin: pay a fixed price, spin for a ₹ prize. Odds are set in the admin panel. */
export default function LuckySpin({ open, onClose }) {
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [error, setError] = useState('')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const audio = useRef(null)
  const timers = useRef([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.get('/games/spin/state').then(
      (d) => {
        if (cancelled) return
        setRules(d.rules)
        setBalance(d.balance)
      },
      (e) => !cancelled && setError(e.message),
    )
    return () => { cancelled = true }
  }, [open, setBalance])

  useEffect(() => {
    audio.current = createWheelAudio()
    const list = timers.current
    return () => {
      list.forEach(clearTimeout)
      audio.current?.dispose()
    }
  }, [])

  const close = () => {
    if (spinning) return
    setError('')
    setResult(null)
    onClose()
  }

  const spin = async () => {
    if (spinning || !rules) return
    setError('')
    setResult(null)
    setSpinning(true)
    audio.current?.click()
    let res
    try {
      res = await api.post('/games/spin/spin')
    } catch (e) {
      setError(e.message)
      setSpinning(false)
      return
    }
    const { prizes } = res.rules
    setRules(res.rules)
    setBalance(balance - res.bet.amount) // show the price leaving now; the prize lands when the wheel stops

    // Bring the middle of the winning slice (±35% jitter) under the pointer at 12 o'clock
    const seg = 360 / prizes.length
    const target = 360 - (res.bet.index + 0.5 + (Math.random() - 0.5) * 0.7) * seg
    const from = rotation
    const to = from + 360 * 6 + ((((target - from) % 360) + 360) % 360)
    setRotation(to)

    // Tick each time a slice boundary passes the pointer
    let last = Math.floor(from / seg)
    const started = performance.now()
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / SPIN_MS)
      const at = Math.floor((from + (to - from) * ease(t)) / seg)
      if (at !== last) {
        last = at
        audio.current?.tick()
      }
      if (t < 1) timers.current.push(setTimeout(tick, 16))
    }
    tick()

    timers.current.push(setTimeout(() => {
      setSpinning(false)
      setBalance(res.balance)
      setResult(res.bet)
      if (res.bet.win > 0) audio.current?.win(res.bet.win / res.bet.amount)
      else audio.current?.lose()
    }, SPIN_MS + 100))
  }

  const cost = rules?.cost ?? 0
  const paused = rules && !rules.enabled

  return (
    <Sheet open={open} title="Lucky Spin" onClose={close}>
      <div className="ls">
        <p className="ls-sub">Spin for <strong>₹{inr(cost)}</strong> and win up to <strong>₹{inr(Math.max(0, ...(rules?.prizes ?? [0])))}</strong></p>

        <div className="ls-stage">
          <span className="ls-pointer" />
          <div
            className="ls-wheel"
            style={{ transform: `rotate(${rotation}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : '0ms' }}
          >
            {rules ? <WheelSvg prizes={rules.prizes} /> : <span className="ls-loading" />}
          </div>
          <span className="ls-hub" />
        </div>

        <div className={`ls-result ${result ? (result.win > 0 ? 'is-win' : 'is-lose') : ''}`} aria-live="polite">
          {result ? (result.win > 0 ? `You won ₹${inr(result.win)}!` : 'No prize this time. Try again!') : ' '}
        </div>

        {error && <div className="ls-error">{error}</div>}

        <button type="button" className="ls-btn" onClick={spin} disabled={!rules || spinning || paused}>
          {paused ? 'Lucky Spin is paused' : spinning ? 'Spinning…' : `Spin for ₹${inr(cost)}`}
        </button>
        <p className="ls-balance">Wallet balance ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
    </Sheet>
  )
}
