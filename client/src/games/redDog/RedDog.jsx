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
import './RedDog.css'

const RESULT_TEXT = {
  win: 'Between! Bet pays',
  triple: 'Three of a kind! 11×',
  push: 'Push — stake back',
  lose: 'Missed — lost',
}

export default function RedDog() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/red-dog/state')
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
    setReveal(null)
    try {
      const res = await api.post('/games/red-dog/deal', { amount })
      const b = res.data.history?.[0]
      setReveal(b)
      setHistory(res.data.history)
      if (b) {
        const suffix = b.result === 'win' ? ` ${b.multiplier}×` : ''
        showToast(b.win > b.amount ? 'success' : b.result === 'push' ? 'info' : 'error', `${RESULT_TEXT[b.result]}${suffix}`)
      }
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Deal failed')
    } finally {
      setBusy(false)
    }
  }

  const spread = reveal && !reveal.spread && reveal.spread !== 0
    ? null
    : reveal?.spread

  return (
    <div className="rd-root">
      <header className="rd-header">
        <div className="rd-title"><Icon name="spade" size={22} strokeWidth={2.2} /><span>Red Dog</span></div>
        <div className="rd-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="rd-main">
        <section className="rd-table">
          <div className="rd-cards">
            <CardFace card={reveal?.card1} back={!reveal?.card1} />
            <div className="rd-middle">
              <span className="rd-spread-pill">
                {reveal?.result === 'push' ? 'PUSH' : spread != null && spread > 0 ? `GAP ${spread}` : '↔'}
              </span>
              <CardFace card={reveal?.card3} back={!reveal?.card3} dim={reveal?.result === 'lose'} />
              <small>third card</small>
            </div>
            <CardFace card={reveal?.card2} back={!reveal?.card2} />
          </div>
          {reveal && (
            <div className={`rd-banner ${reveal.win > reveal.amount ? 'is-win' : reveal.result === 'push' ? 'is-push' : 'is-loss'}`}>
              {RESULT_TEXT[reveal.result]}{reveal.result === 'win' ? ` ${reveal.multiplier}×` : ''}
            </div>
          )}
        </section>

        <section className="rd-controls">
          <label className="rd-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="rd-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="rd-deal" onClick={deal} disabled={busy}>
            <Icon name="shuffle" size={16} strokeWidth={2.5} /> {busy ? 'Dealing…' : 'DEAL'}
          </button>
        </section>

        <details className="rd-rules">
          <summary>How to play</summary>
          <ul>
            <li>Two cards are dealt; a third card decides</li>
            <li>Falls <strong>between</strong> → paid by the spread:</li>
            <li>1 gap <strong>5×</strong> · 2 gaps <strong>4×</strong> · 3 gaps <strong>2×</strong> · 4+ gaps <strong>1×</strong></li>
            <li>Consecutive cards and pairs <strong>push</strong></li>
            <li>A pair that becomes trips pays <strong>11×</strong></li>
          </ul>
        </details>

        <div className="rd-history">
          <h3>Recent deals</h3>
          {history.length ? (
            <div className="rd-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="rd-hist-item">
                  <span className="rd-hist-cards">{b.card1} {b.card2} → {b.card3}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.result === 'win' ? 'win' : b.result === 'push' ? 'push' : 'lose'}>
                    {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.result === 'push' ? 'Push' : 'Lost'}
                  </span>
                  <span className="rd-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="rd-empty">No deals yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`rd-toast rd-toast-${toast.kind}`} role="status">
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
