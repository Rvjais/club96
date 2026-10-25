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
import './CaribbeanStud.css'

const RESULT_TEXT = {
  playerWins: 'You win',
  dealerWins: 'Dealer wins',
  push: 'Push',
  folded: 'Folded',
  dealerNoQualify: 'Dealer no qualify — ante pays, raise pushes',
}

export default function CaribbeanStud() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [ante, setAnte] = useState('10')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/caribbean-stud/state')
    setRules(res.data.rules)
    setActive(res.data.active)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const deal = async () => {
    if (busy) return
    const a = Number(ante)
    if (!a || a <= 0) return showToast('error', 'Enter an ante')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/caribbean-stud/deal', { ante: a })
      setActive(res.data.active)
      showToast('info', 'Dealt — play for 2× the ante, or fold')
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
      const res = await api.post('/games/caribbean-stud/play')
      setActive(null)
      setHistory(res.data.history)
      const b = res.data.history?.[0]
      if (b) {
        const profit = b.win - b.amount
        showToast(b.win > b.amount ? 'success' : 'error',
          `${b.playerHand} vs ${b.dealerHand}${b.dealerQualified === false ? ' (no qualify)' : ''} — ${b.win > b.amount ? `+${money(profit)}` : 'lost raise'}`)
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
      const res = await api.post('/games/caribbean-stud/fold')
      setActive(null)
      setHistory(res.data.history)
      showToast('error', 'Folded — ante lost')
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Fold failed')
    } finally {
      setBusy(false)
    }
  }

  const last = !active ? history[0] : null
  const cards = active ?? last

  return (
    <div className="cs-root">
      <header className="cs-header">
        <div className="cs-title"><Icon name="spade" size={22} strokeWidth={2.2} /><span>Caribbean Stud</span></div>
        <div className="cs-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="cs-main">
        <section className="cs-table">
          <div className="cs-pos">
            <span className="cs-label">YOU</span>
            <div className="cs-cards">
              {cards
                ? cards.playerCards.map((c, i) => <CardFace key={i} card={c} small />)
                : <><CardFace back small /><CardFace back small /><CardFace back small /><CardFace back small /><CardFace back small /></>}
            </div>
            {last && <em className="cs-hand-name">{last.playerHand}</em>}
          </div>
          <div className="cs-pos">
            <span className="cs-label">DEALER</span>
            <div className="cs-cards">
              {last
                ? last.dealerCards.map((c, i) => <CardFace key={i} card={c} small />)
                : <><CardFace back small /><CardFace back small /><CardFace back small /><CardFace back small /><CardFace back small /></>}
            </div>
            {last ? <em className={`cs-hand-name ${last.dealerQualified === false ? 'dim' : ''}`}>{last.dealerHand}{last.dealerQualified === false ? ' · no Q' : ''}</em> : <em className="cs-note">K-high to qualify</em>}
          </div>
        </section>

        {active ? (
          <section className="cs-actions">
            <button type="button" className="cs-play" onClick={play} disabled={busy}>
              <Icon name="play" size={16} strokeWidth={3} /> PLAY (2× ante = {money(active.ante * 2)})
            </button>
            <button type="button" className="cs-fold" onClick={fold} disabled={busy}>
              FOLD (-{money(active.ante)})
            </button>
          </section>
        ) : (
          <section className="cs-controls">
            <label className="cs-stake">
              <span>Ante</span>
              <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={ante} onChange={e => setAnte(e.target.value)} inputMode="decimal" />
            </label>
            <button type="button" className="cs-deal" onClick={deal} disabled={busy}>
              <Icon name="shuffle" size={16} strokeWidth={2.5} /> {busy ? 'Dealing…' : 'DEAL'}
            </button>
          </section>
        )}

        {last && (
          <div className={`cs-banner ${last.win > last.amount ? 'is-win' : last.result === 'push' || last.result === 'dealerNoQualify' ? 'is-push' : 'is-loss'}`}>
            {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${last.win > last.amount ? `+${money(last.win - last.amount)}` : money(last.win)}` : ''}
          </div>
        )}

        <details className="cs-rules">
          <summary>How to play</summary>
          <ul>
            <li>Place an <strong>ante</strong>, get 5 cards</li>
            <li><strong>Play</strong> raises exactly <strong>2× the ante</strong>, or fold</li>
            <li>Dealer needs <strong>K-high+</strong>: no qualify → ante pays, raise pushes</li>
            <li>Raise pays up to <strong>50× (straight flush)</strong>, 20× quads, 7× full house…</li>
          </ul>
        </details>

        <div className="cs-history">
          <h3>Recent hands</h3>
          {history.length ? (
            <div className="cs-hist-list">
              {history.slice(0, 12).map(b => (
                <div key={b.id} className="cs-hist-item">
                  <span className="cs-hist-hand">{b.playerHand}</span>
                  <span>{money(b.ante)}</span>
                  <span className={b.win > b.amount ? 'win' : 'lose'}>
                    {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.result === 'push' ? 'Push' : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
                  </span>
                  <span className="cs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="cs-empty">No hands yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`cs-toast cs-toast-${toast.kind}`} role="status">
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
