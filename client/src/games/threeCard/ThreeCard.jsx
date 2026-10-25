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
import './ThreeCard.css'

const RESULT_TEXT = {
  playerWins: 'You win',
  dealerWins: 'Dealer wins',
  push: 'Push',
  folded: 'Folded',
  dealerNoQualify: 'Dealer no qualify — ante pays', 
}

export default function ThreeCard() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [ante, setAnte] = useState('10')
  const [pairPlus, setPairPlus] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/three-card/state')
    setRules(res.data.rules)
    setActive(res.data.active)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const deal = async () => {
    if (busy) return
    const a = Number(ante)
    const pp = Number(pairPlus || 0)
    if (!a || a <= 0) return showToast('error', 'Enter an ante')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/three-card/deal', { ante: a, pairPlus: pp })
      setActive(res.data.active)
      showToast('info', 'Dealt — play or fold')
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Deal failed')
    } finally {
      setBusy(false)
    }
  }

  const play = async () => {
    if (busy || !active) return
    setBusy(true)
    try {
      const res = await api.post('/games/three-card/play')
      setActive(null)
      setHistory(res.data.history)
      const b = res.data.history?.[0]
      if (b) {
        const profit = b.win - b.amount
        showToast(b.win > b.amount ? 'success' : b.result === 'push' ? 'info' : 'error',
          `${b.playerHand} vs ${b.dealerHand}${b.dealerQualified === false ? ' (no qualify)' : ''} — ${b.win > b.amount ? `+${money(profit)}` : b.result === 'push' ? 'push' : `${RESULT_TEXT[b.result]}`}`)
      }
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Play failed')
    } finally {
      setBusy(false)
    }
  }

  const fold = async () => {
    if (busy || !active) return
    setBusy(true)
    try {
      const res = await api.post('/games/three-card/fold')
      setActive(null)
      setHistory(res.data.history)
      const b = res.data.history?.[0]
      showToast(b.win > 0 ? 'success' : 'error', b.win > 0 ? `Folded — Pair+ paid ${money(b.win)}` : 'Folded — ante lost')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Fold failed')
    } finally {
      setBusy(false)
    }
  }

  const last = !active ? history[0] : null
  const showPlayerCards = active || last
  // dealer cards revealed only on finished rounds
  const dealerShown = !!last

  return (
    <div className="tc-root">
      <header className="tc-header">
        <div className="tc-title"><Icon name="heart" size={22} strokeWidth={2.2} /><span>3 Card Poker</span></div>
        <div className="tc-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="tc-main">
        <section className="tc-table">
          <div className="tc-pos tc-pos-player">
            <span className="tc-label">YOU</span>
            <div className="tc-cards">
              {showPlayerCards ? (active ?? last).playerCards.map((c, i) => <CardFace key={i} card={c} />) : <CardFace back />}
            </div>
            {active ? <em className="tc-note">your hand</em> : last ? <em className="tc-hand-name">{last.playerHand}</em> : null}
          </div>
          <div className="tc-pos tc-pos-dealer">
            <span className="tc-label">DEALER</span>
            <div className="tc-cards">
              {dealerShown
                ? last.dealerCards.map((c, i) => <CardFace key={i} card={c} />)
                : <><CardFace back /> <CardFace back /> <CardFace back /></>}
            </div>
            {last ? <em className="tc-hand-name">{last.dealerHand}</em> : <em className="tc-note">Q-high to qualify</em>}
          </div>
        </section>

        {active ? (
          <section className="tc-actions">
            <button type="button" className="tc-play" onClick={play} disabled={busy}>
              <Icon name="play" size={16} strokeWidth={3} /> PLAY (match ante {money(active.ante)})
            </button>
            <button type="button" className="tc-fold" onClick={fold} disabled={busy}>
              FOLD
            </button>
          </section>
        ) : (
          <section className="tc-controls">
            <div className="tc-input-row">
              <label>
                <span>Ante</span>
                <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={ante} onChange={e => setAnte(e.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span>Pair+ (optional)</span>
                <input type="number" min={0} max={rules?.maxBet ?? 10000} value={pairPlus} onChange={e => setPairPlus(e.target.value)} inputMode="decimal" placeholder="0" />
              </label>
            </div>
            <button type="button" className="tc-deal" onClick={deal} disabled={busy}>
              <Icon name="shuffle" size={16} strokeWidth={2.5} /> {busy ? 'Dealing…' : 'DEAL'}
            </button>
          </section>
        )}

        {last && (
          <div className={`tc-banner ${last.win > last.amount ? 'is-win' : last.result === 'push' || last.result === 'dealerNoQualify' ? 'is-push' : 'is-loss'}`}>
            {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${last.win > last.amount ? `+${money(last.win - last.amount)}` : money(last.win)}` : ''}
          </div>
        )}

        <details className="tc-rules">
          <summary>How to play</summary>
          <ul>
            <li>Place an <strong>ante</strong> (+ optional <strong>Pair Plus</strong>)</li>
            <li><strong>Play</strong> = match your ante; <strong>Fold</strong> = forfeit it</li>
            <li>Dealer needs <strong>Q-high+</strong>: no qualify → ante pays, play pushes</li>
            <li>Ranks: SF &gt; trips &gt; straight &gt; flush &gt; pair &gt; high</li>
            <li>Pair+: pair 1:1 · flush 4:1 · straight 6:1 · trips 30:1 · SF 40:1</li>
          </ul>
        </details>

        <div className="tc-history">
          <h3>Recent hands</h3>
          {history.length ? (
            <div className="tc-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="tc-hist-item">
                  <span className="tc-hist-cards">{b.playerCards.join(' ')}</span>
                  <span>{b.playerHand}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > b.amount ? 'win' : 'lose'}>
                    {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
                  </span>
                  <span className="tc-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="tc-empty">No hands yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`tc-toast tc-toast-${toast.kind}`} role="status">
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
