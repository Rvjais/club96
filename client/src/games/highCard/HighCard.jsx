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
import './HighCard.css'

const RESULT_TEXT = { playerWins: 'You win', dealerWins: 'Dealer wins', push: 'Push' }

export default function HighCard() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(null) // the bet that just played out
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/high-card/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const draw = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    setReveal(null)
    try {
      const res = await api.post('/games/high-card/draw', { amount })
      const b = res.data.history?.[0]
      setReveal(b)
      setHistory(res.data.history)
      if (b) {
        const text = b.result === 'playerWins'
          ? `${b.playerCard} beats ${b.dealerCard} — won ${money(b.win)}!`
          : b.result === 'push'
            ? `Both ${b.playerCard} — push`
            : `${b.dealerCard} beats ${b.playerCard} — lost`
        showToast(b.result === 'playerWins' ? 'success' : b.result === 'push' ? 'info' : 'error', text)
      }
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Draw failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hc-root">
      <header className="hc-header">
        <div className="hc-title"><Icon name="spade" size={22} strokeWidth={2.2} /><span>High Card Draw</span></div>
        <div className="hc-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="hc-main">
        <section className="hc-table">
          <div className="hc-hand">
            <span className="hc-label">YOU</span>
            <div className="hc-cards">
              {reveal?.playerCard
                ? <CardFace card={reveal.playerCard} />
                : <CardFace back />}
            </div>
          </div>
          <div className="hc-vs">VS</div>
          <div className="hc-hand">
            <span className="hc-label">DEALER</span>
            <div className="hc-cards">
              <CardFace card={reveal?.dealerCard ?? null} back={reveal?.dealerCard ? false : true} dim={reveal && reveal.result === 'playerWins'} />
            </div>
          </div>
        </section>

        {reveal && (
          <div className={`hc-banner ${reveal.result === 'playerWins' ? 'is-win' : reveal.result === 'push' ? 'is-push' : 'is-loss'}`}>
            {RESULT_TEXT[reveal.result]}{reveal.win > 0 && reveal.result !== 'push' ? ` — +${money(reveal.win)}` : ''}
          </div>
        )}

        <section className="hc-controls">
          <label className="hc-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="hc-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="hc-draw" onClick={draw} disabled={busy}>
            <Icon name="shuffle" size={16} strokeWidth={2.5} /> {busy ? 'Drawing…' : 'DRAW CARDS'}
          </button>
        </section>

        <details className="hc-rules">
          <summary>How to play</summary>
          <ul>
            <li>One card for you, one for the dealer</li>
            <li><strong>Ace is high</strong>; the higher card wins</li>
            <li>Win pays <strong>{rules?.payout ?? 1.92}×</strong> · identical ranks push</li>
          </ul>
        </details>

        <div className="hc-history">
          <h3>Recent draws</h3>
          {history.length ? (
            <div className="hc-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="hc-hist-item">
                  <span className="hc-hist-cards">{b.playerCard} vs {b.dealerCard}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.result === 'playerWins' ? 'win' : 'lose'}>{RESULT_TEXT[b.result]}</span>
                  <span className="hc-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="hc-empty">No draws yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`hc-toast hc-toast-${toast.kind}`} role="status">
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
