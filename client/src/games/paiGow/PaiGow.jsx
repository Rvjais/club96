import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import { CardFace } from '../lib/cards'
import '../lib/cards.css'
import './PaiGow.css'

const RESULT_TEXT = {
  playerWins: 'You win both — 1:1 minus 5% commission',
  dealerWins: 'Dealer wins',
  push: 'Push — stake back',
}

export default function PaiGow() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2800)
  }

  const fetchState = async () => {
    const res = await api.get('/games/pai-gow/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const deal = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/pai-gow/deal', { amount })
      const b = res.data.history?.[0]
      setLast(b)
      setHistory(res.data.history)
      showToast(b.result === 'playerWins' ? 'success' : b.result === 'push' ? 'info' : 'error', RESULT_TEXT[b.result])
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Deal failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pg-root">
      <header className="pg-header">
        <div className="pg-title"><Icon name="layers" size={22} strokeWidth={2.2} /><span>Pai Gow Poker</span></div>
        <div className="pg-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="pg-main">
        {last && (
          <section className="pg-table">
            <div className="pg-side">
              <span className="pg-label">YOU — HIGH (5)</span>
              <div className="pg-cards">{last.playerHigh.map((c, i) => <CardFace key={i} card={c} small />)}</div>
              <span className="pg-label pg-low">YOU — LOW (2)</span>
              <div className="pg-cards">{last.playerLow.map((c, i) => <CardFace key={i} card={c} small />)}</div>
            </div>
            <div className="pg-divider">VS</div>
            <div className="pg-side">
              <span className="pg-label">DEALER — HIGH (5)</span>
              <div className="pg-cards">{last.dealerHigh.map((c, i) => <CardFace key={i} card={c} small />)}</div>
              <span className="pg-label pg-low">DEALER — LOW (2)</span>
              <div className="pg-cards">{last.dealerLow.map((c, i) => <CardFace key={i} card={c} small />)}</div>
            </div>
            <div className={`pg-banner ${last.result === 'playerWins' ? 'is-win' : last.result === 'push' ? 'is-push' : 'is-loss'}`}>
              {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${money(last.win)}` : ''}
            </div>
          </section>
        )}

        <section className="pg-controls">
          <label className="pg-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="pg-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="pg-deal" onClick={deal} disabled={busy}>
            <Icon name="shuffle" size={16} strokeWidth={2.5} /> {busy ? 'Dealing…' : 'DEAL & SPLIT'}
          </button>
        </section>

        <details className="pg-rules" open={!last}>
          <summary>How to play</summary>
          <ul>
            <li>You get <strong>7 cards</strong>, dealer gets 7</li>
            <li>Both hands are split automatically into a <strong>5-card high</strong> and a <strong>2-card low</strong></li>
            <li><strong>Win both</strong> hands → paid 1:1 minus 5% commission</li>
            <li>Split 1–1 → <strong>push</strong>; otherwise you lose</li>
            <li>Two-card hand: any <strong>pair</strong> beats any two singles</li>
          </ul>
        </details>

        <div className="pg-history">
          <h3>Recent hands</h3>
          {history.length ? (
            <div className="pg-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="pg-hist-item">
                  <span className={b.result === 'playerWins' ? 'win' : b.result === 'push' ? 'push' : 'lose'}>
                    {b.result === 'playerWins' ? 'WON' : b.result === 'push' ? 'PUSH' : 'LOST'}
                  </span>
                  <span>{money(b.amount)}</span>
                  <span className={b.result === 'playerWins' ? 'win' : b.result === 'push' ? 'push' : 'lose'}>
                    {b.result === 'playerWins' ? `+${money(b.win - b.amount)}` : b.result === 'push' ? money(b.win) : '−' + money(b.amount)}
                  </span>
                  <span className="pg-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="pg-empty">No hands yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`pg-toast pg-toast-${toast.kind}`} role="status">
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
