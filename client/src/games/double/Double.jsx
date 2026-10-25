import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { useSiteConfig } from '../../lib/siteConfig'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import GameShell from '../lib/GameShell'
import './Double.css'

const COLORS = [
  { id: 'red', label: 'RED', icon: 'circle', bg: '#e5484d', glow: '#ff8a8a' },
  { id: 'black', label: 'BLACK', icon: 'circle', bg: '#2b3948', glow: '#b7c6d6' },
]

export default function Double() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [selected, setSelected] = useState(null)
  const [amount, setAmount] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const animRef = useRef(null)

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
    const res = await api.get('/games/double/state')
    setState(res)
  }

  useEffect(() => {
    fetchState()
  }, [])

  const handleBet = async () => {
    if (!selected) return showToast('error', 'Pick Red or Black')
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/double/bet', { color: selected, amount: paise / 100 })
      setState(res)
      setAmount('')
      setSelected(null)
      setLastResult({ color: res.history[0]?.result, win: res.history[0]?.win })
      showToast(res.history[0]?.win > 0 ? 'success' : 'error',
        res.history[0]?.win > 0 ? `Won ${money(res.history[0].win)}` : 'Lost')
    } catch (e) {
      showToast('error', e.message || 'Bet failed')
    }
  }

  const renderResult = (color) => {
    if (!color) return null
    const c = COLORS.find(x => x.id === color)
    return (
      <div className="dbl-result" style={{ background: c.bg }}>
        <Icon name={c.icon} size={48} fill={c.id === 'red' ? '#ff8a8a' : '#dfe8ee'} strokeWidth={0} />
        <span>{c.label}</span>
      </div>
    )
  }

  return (
    <GameShell
      icon="flame"
      title="Double"
      tagline="Red or black"
      accent="#ff5a5f"
      toast={toast}
      onRefresh={refresh}
    >
      <div className="dbl-main">
        {/* Last result display */}
        <div className="dbl-last-result">
          {lastResult && (
            <div className="dbl-last-card" style={{ background: COLORS.find(c => c.id === lastResult.color)?.bg }}>
              <span>Last: {COLORS.find(c => c.id === lastResult.color)?.label}</span>
              <span className={lastResult.win > 0 ? 'win' : 'lose'}>
                {lastResult.win > 0 ? `+${money(lastResult.win)}` : 'Lost'}
              </span>
            </div>
          )}
        </div>

        {/* Color selection */}
        <div className="dbl-pick">
          {COLORS.map(c => (
            <button
              key={c.id}
              type="button"
              className={`dbl-color-btn ${selected === c.id ? 'selected' : ''}`}
              style={{ background: c.bg, boxShadow: selected === c.id ? `0 0 0 3px ${c.glow}` : 'none' }}
              onClick={() => setSelected(c.id)}
            >
              <Icon name={c.icon} size={36} fill={c.id === 'red' ? '#ff6b6b' : '#fff'} strokeWidth={0} />
              <span>{c.label}</span>
              <span className="dbl-payout">1.95x</span>
            </button>
          ))}
        </div>

        {/* Bet input */}
        <div className="dbl-bet-input">
          <label>Bet Amount (₹)</label>
          <div className="dbl-input-row">
            <input
              type="number"
              step="10"
              min={state?.rules?.minBet || 10}
              max={state?.rules?.maxBet || 10000}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              inputMode="decimal"
            />
            <button type="button" className="dbl-btn-bet" onClick={handleBet} disabled={!selected || !amount}>
              <Icon name="play" size={16} strokeWidth={2.5} /> BET
            </button>
          </div>
          <div className="dbl-quick-bets">
            {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 10) && v <= (state?.rules?.maxBet || 10000)).map(v => (
              <button key={v} type="button" onClick={() => setAmount(String(v))}>₹{v}</button>
            ))}
          </div>
        </div>

        {/* Rules */}
        <details className="dbl-rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick <strong>Red</strong> or <strong>Black</strong></li>
            <li>Enter your bet amount</li>
            <li>Win pays <strong>1.95x</strong> (2.5% house edge)</li>
            <li>Instant result — no waiting</li>
          </ul>
        </details>

        {/* History */}
        <div className="dbl-history">
          <h3>Recent Bets</h3>
          {state?.history?.length ? (
            <div className="dbl-history-list">
              {state.history.slice(0, 15).map(b => (
                <div key={b.id} className="dbl-history-item">
                  <span className="dbl-hist-color" style={{ background: COLORS.find(c => c.id === b.color)?.bg }}>
                    {COLORS.find(c => c.id === b.color)?.label}
                  </span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
                  <span className="dbl-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dbl-empty">No bets yet</p>
          )}
        </div>
      </div>

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
    </GameShell>
  )
}