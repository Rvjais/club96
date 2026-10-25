import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import './ThaiLottery.css'

export default function ThaiLottery() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [mode, setMode] = useState('2d')
  const [betType, setBetType] = useState('exact')
  const [pick, setPick] = useState('')
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const digits = mode === '2d' ? 2 : 3

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/thai-lottery/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const switchMode = (m) => {
    setMode(m)
    setPick('')
    setBetType('exact')
  }

  const tap = (d) => {
    setPick(p => (p + d).slice(0, digits))
  }

  const bet = async () => {
    if (busy) return
    if (pick.length !== digits) return showToast('error', `Pick ${digits} digit${digits > 1 ? 's' : ''}`)
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/thai-lottery/bet', { mode, betType, pick, amount })
      const b = res.data.history?.[0]
      setDraw({ draw: b.draw, pick: b.pick, win: b.win, status: b.status })
      setHistory(res.data.history)
      showToast(b.win > 0 ? 'success' : 'error', b.win > 0 ? `🎉 ${b.draw} — won ${money(b.win)}!` : `${b.draw} — no match`)
      setPick('')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Bet failed')
    } finally {
      setBusy(false)
    }
  }

  const payouts = rules?.payouts ?? {}

  return (
    <div className="tl-root">
      <header className="tl-header">
        <div className="tl-title"><Icon name="ticket" size={22} strokeWidth={2.2} /><span>Thai Lottery</span></div>
        <div className="tl-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="tl-main">
        <div className="tl-modes">
          <button type="button" className={mode === '2d' ? 'active' : ''} onClick={() => switchMode('2d')}>2D</button>
          <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => switchMode('3d')}>3D</button>
          <div className="tl-types">
            <button type="button" className={betType === 'exact' ? 'active' : ''} onClick={() => setBetType('exact')}>Exact</button>
            <button type="button" className={betType === 'box' ? 'active' : ''} onClick={() => setBetType('box')}>Any order</button>
          </div>
        </div>

        <section className="tl-board">
          <div className="tl-slots">
            {Array.from({ length: digits }).map((_, i) => (
              <span key={i} className={`tl-digit ${i < pick.length ? 'filled' : ''}`}>{pick[i] ?? '?'}</span>
            ))}
          </div>
          <div className="tl-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map(k => (
              <button key={k} type="button" onClick={() => {
                if (k === 'C') setPick('')
                else if (k === '←') setPick(p => p.slice(0, -1))
                else tap(k)
              }}>{k}</button>
            ))}
            <button type="button" className="tl-go" onClick={bet} disabled={busy || pick.length !== digits}>
              GO
            </button>
          </div>

          <label className="tl-stake">
            <span>Stake per bet</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="tl-quick">
            {[10, 20, 50, 100].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
        </section>

        {draw && (
          <div className={`tl-draw ${draw.status === 'won' ? 'is-win' : 'is-loss'}`}>
            DRAW: <strong>{draw.draw}</strong> · pick {draw.pick} · {draw.status === 'won' ? `won ${money(draw.win)}` : 'no match'}
          </div>
        )}

        <div className="tl-pay">
          {mode === '2d' ? (
            <>
              <span>2D exact <strong>{payouts['2d-exact'] ?? 85}×</strong></span>
              <span>2D any order <strong>{payouts['2d-box'] ?? 40}×</strong></span>
            </>
          ) : (
            <>
              <span>3D exact <strong>{payouts['3d-exact'] ?? 800}×</strong></span>
              <span>3D box (pair) <strong>{payouts['3d-box-pair'] ?? 240}×</strong></span>
              <span>3D box (6-way) <strong>{payouts['3d-box-6way'] ?? 120}×</strong></span>
            </>
          )}
        </div>

        <details className="tl-rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick 2 or 3 digits (0–9), then stake</li>
            <li><strong>Exact</strong>: digits must match the draw in order</li>
            <li><strong>Any order (box)</strong>: match rearranged — needs non-repeating digits</li>
            <li>A fresh digit draw for every bet</li>
          </ul>
        </details>

        <div className="tl-history">
          <h3>Recent bets</h3>
          {history.length ? (
            <div className="tl-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="tl-hist-item">
                  <span className="tl-hist-pick">{b.pick}</span>
                  <span className="tl-hist-draw">→ {b.draw}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)} (${b.multiplier}×)` : 'Lost'}
                  </span>
                  <span className="tl-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="tl-empty">No bets yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`tl-toast tl-toast-${toast.kind}`} role="status">
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
