import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import './CoinFlip.css'

const flipped = (side) => (side === 'heads' ? 'H' : 'T')

export default function CoinFlip() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [side, setSide] = useState('heads')
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [face, setFace] = useState('?')
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0
  const flipTimer = useRef(null)

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2400)
  }

  const fetchState = async () => {
    const res = await api.get('/games/coin-flip/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => {
    fetchState()
    return () => clearTimeout(flipTimer.current)
  }, [])

  const bet = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    setBusy(true)
    setSpinning(true)
    setFace('?')
    try {
      const res = await api.post('/games/coin-flip/bet', { side, amount })
      // animation: alternate faces while the coin "spins"
      let flips = 0
      clearInterval(flipTimer.current)
      flipTimer.current = setInterval(() => {
        flips += 1
        setFace(flips % 2 === 0 ? 'H' : 'T')
        if (flips >= 8) {
          clearInterval(flipTimer.current)
          setFace(flipped(res.data.history?.[0]?.result ?? side))
          setSpinning(false)
          const last = res.data.history?.[0]
          if (last) {
            const text = last.win > 0
              ? `${flipped(last.result)} — won ${money(last.win)}!`
              : `${flipped(last.result)} — lost`
            showToast(last.win > 0 ? 'success' : 'error', text)
          }
          setHistory(res.data.history)
          setBusy(false)
          refreshWallet().catch(() => {})
        }
      }, 110)
    } catch (e) {
      setSpinning(false)
      setBusy(false)
      showToast('error', e.response?.data?.error || 'Bet failed')
    }
  }

  const last = history[0]
  const payout = rules?.payout ?? 1.95

  return (
    <div className="cfp-root">
      <header className="cfp-header">
        <div className="cfp-title"><Icon name="coins" size={22} strokeWidth={2.2} /><span>Coin Flip</span></div>
        <div className="cfp-balance">
          <span>{money(balance)}</span>
          <button className={`cfp-refresh ${spinning ? 'spin' : ''}`} onClick={() => { setSpinning(true); Promise.all([fetchState(), refreshWallet().catch(() => {}), new Promise(r => setTimeout(r, 500))]).then(() => setSpinning(false)) }} aria-label="Refresh">
            <Icon name="refresh" size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="cfp-main">
        <section className="cfp-coinbox">
          <div className={`cfp-coin ${spinning ? 'spinning' : ''} ${face === 'T' ? 'tails' : ''}`}>
            <span className="cfp-face">{face}</span>
            <small className="cfp-face-sub">{face === 'H' ? 'HEADS' : face === 'T' ? 'TAILS' : 'READY'}</small>
          </div>
          {last && (
            <div className={`cfp-last ${last.win > 0 ? 'is-win' : 'is-loss'}`}>
              {last.win > 0 ? `+${money(last.win)}` : `−${money(last.amount)}`} · {last.side === last.result ? 'Called it' : 'Missed'}
            </div>
          )}
        </section>

        <section className="cfp-controls">
          <div className="cfp-sides">
            <button type="button" className={`cfp-side heads ${side === 'heads' ? 'active' : ''}`} onClick={() => setSide('heads')}>
              <span className="cfp-side-face">H</span> Heads <em>{payout}x</em>
            </button>
            <button type="button" className={`cfp-side tails ${side === 'tails' ? 'active' : ''}`} onClick={() => setSide('tails')}>
              <span className="cfp-side-face">T</span> Tails <em>{payout}x</em>
            </button>
          </div>
          <label className="cfp-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="cfp-quick">
            {[10, 50, 100, 500, 1000].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="cfp-bet" onClick={bet} disabled={busy}>
            <Icon name="play" size={16} strokeWidth={2.5} /> FLIP
          </button>
        </section>

        <details className="cfp-rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick <strong>heads</strong> or <strong>tails</strong></li>
            <li>Win pays <strong>{payout}×</strong> the stake</li>
            <li>Fair 50 / 50 shot on every flip</li>
          </ul>
        </details>

        <div className="cfp-history">
          <h3>Recent flips</h3>
          {history.length ? (
            <div className="cfp-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="cfp-hist-item">
                  <span className={`cfp-hist-coin ${b.result === 'heads' ? 'h' : 't'}`}>{flipped(b.result)}</span>
                  <span>{b.side} {b.side === b.result ? '✓' : '✗'}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
                  <span className="cfp-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="cfp-empty">No flips yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`cfp-toast cfp-toast-${toast.kind}`} role="status">
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
