import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
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

  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/caribbean-stud/state')
    setRules(res.rules)
    setActive(res.active)
    setHistory(res.history)
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
      setActive(res.active)
      showToast('info', 'Dealt — play for 2× the ante, or fold')
    } catch (e) {
      showToast('error', e.message || 'Deal failed')
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
      setHistory(res.history)
      const b = res.history?.[0]
      if (b) {
        const profit = b.win - b.amount
        showToast(b.win > b.amount ? 'success' : 'error',
          `${b.playerHand} vs ${b.dealerHand}${b.dealerQualified === false ? ' (no qualify)' : ''} — ${b.win > b.amount ? `+${money(profit)}` : 'lost raise'}`)
      }
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.message || 'Play failed')
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
      setHistory(res.history)
      showToast('error', 'Folded — ante lost')
    } catch (e) {
      showToast('error', e.message || 'Fold failed')
    } finally {
      setBusy(false)
    }
  }

  const last = !active ? history[0] : null
  const cards = active ?? last

  // purely-visual fan keys so the deal animations replay each hand
  const playerFanKey = active ? `a${active.playerCards.join('')}` : last ? `l${last.id || ''}` : 'idle'
  const dealerFanKey = last ? `d${last.dealerCards.join('')}` : 'idle'

  const halfAnte = () => setAnte(String(Math.max(minBet, Math.floor((Number(ante) || 0) / 2) || minBet)))
  const doubleAnte = () => setAnte(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(ante) || 0) * 2)))))
  const maxAnte = () => setAnte(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  return (
    <GameShell
      icon="shuffle"
      title="Caribbean Stud"
      tagline="5-card vs house"
      accent="#ff9f45"
      wide
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="cs-dock">
          {active ? (
            <div className="cs-dock-actions">
              <button type="button" className="gs-cta" onClick={play} disabled={busy}>
                <Icon name="trendingUp" size={17} strokeWidth={2.6} /> RAISE (2× ante = {money(active.ante * 2)})
              </button>
              <button type="button" className="gs-btn-ghost cs-fold" onClick={fold} disabled={busy}>
                FOLD (-{money(active.ante)})
              </button>
            </div>
          ) : (
            <>
              <div className="gs-input-row">
                <div className="gs-field">
                  <span className="gs-cur">₹</span>
                  <input
                    className="gs-input"
                    type="number"
                    min={minBet}
                    max={maxBet}
                    value={ante}
                    onChange={e => setAnte(e.target.value)}
                    inputMode="decimal"
                    aria-label="Ante"
                  />
                </div>
                <button type="button" className="gs-chip" onClick={halfAnte}>1/2</button>
                <button type="button" className="gs-chip" onClick={doubleAnte}>2×</button>
                <button type="button" className="gs-chip" onClick={maxAnte}>MAX</button>
              </div>
              <div className="gs-quick">
                {[10, 50, 100, 500].filter(v => v >= minBet && v <= maxBet).map(v => (
                  <button key={v} type="button" className="gs-chip" onClick={() => setAnte(String(v))}>₹{v}</button>
                ))}
              </div>
              <button type="button" className="gs-cta" onClick={deal} disabled={busy}>
                <Icon name={busy ? 'refresh' : 'shuffle'} size={17} strokeWidth={2.6} />
                {busy ? 'Dealing…' : 'DEAL'}
              </button>
            </>
          )}
        </div>
      )}
    >
      <section className="gs-stage cs-stage">
        <div className="cs-glow" aria-hidden="true" />

        <div className="cs-row">
          <span className="cs-seat">DEALER</span>
          <div className="cs-fan cs-fan-dealer" key={dealerFanKey}>
            {last
              ? last.dealerCards.map((c, i) => <span key={i} className="cs-slot"><CardFace card={c} small /></span>)
              : Array.from({ length: 5 }, (_, i) => <span key={i} className="cs-slot"><CardFace back small /></span>)}
          </div>
          {last
            ? <em className={`cs-hand-name ${last.dealerQualified === false ? 'dim' : ''}`}>{last.dealerHand}{last.dealerQualified === false ? ' · no Q' : ''}</em>
            : <em className="cs-note">K-high to qualify</em>}
        </div>

        <div className="cs-bridge">
          <span className="cs-vs-chip"><Icon name="shuffle" size={11} strokeWidth={2.6} /> VS</span>
        </div>

        <div className="cs-row cs-row-player">
          <div className="cs-fan cs-fan-player" key={playerFanKey}>
            {cards
              ? cards.playerCards.map((c, i) => <span key={i} className="cs-slot"><CardFace card={c} small /></span>)
              : Array.from({ length: 5 }, (_, i) => <span key={i} className="cs-slot"><CardFace back small /></span>)}
          </div>
          {last && <em className="cs-hand-name">{last.playerHand}</em>}
        </div>
      </section>

      {last && (
        <div className={`gs-banner ${last.win > last.amount ? 'win' : last.result === 'push' || last.result === 'dealerNoQualify' ? 'push' : 'loss'}`}>
          {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${last.win > last.amount ? `+${money(last.win - last.amount)}` : money(last.win)}` : ''}
        </div>
      )}

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > b.amount ? 'win' : b.result === 'push' || b.result === 'dealerNoQualify' ? '' : 'loss'}`}>{b.playerHand}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{history.length}</b>
          <span>Hands</span>
        </div>
        <div className="gs-stat">
          <b>{last ? (last.win > last.amount ? `+${money(last.win - last.amount)}` : last.win > 0 ? `+${money(last.win)}` : 'LOST') : '—'}</b>
          <span>Last payout</span>
        </div>
        <div className="gs-stat">
          <b>{money(Number(ante) || 0)}</b>
          <span>Ante now</span>
        </div>
      </div>

      <section className="gs-panel gs-hist cs-hist">
        <div className="gs-panel-title"><Icon name="history" size={12} strokeWidth={2.4} /> Recent hands</div>
        {history.length ? (
          history.slice(0, 12).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className="cs-hist-hand">{b.playerHand}</span>
              <span className="cs-hist-line">
                ante {money(b.ante)}
                {b.amount > b.ante && <em className="cs-hist-raise">· raise {money(b.amount - b.ante)}</em>}
              </span>
              <span className={`cs-hist-res ${b.win > b.amount ? 'win' : 'lose'}`}>
                {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.result === 'push' ? 'Push' : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No hands yet</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Place an <strong>ante</strong>, get 5 cards</li>
          <li><strong>Play</strong> raises exactly <strong>2× the ante</strong>, or fold</li>
          <li>Dealer needs <strong>K-high+</strong>: no qualify &#8594; ante pays, raise pushes</li>
          <li>Raise pays up to <strong>50× (straight flush)</strong>, 20× quads, 7× full house&#8230;</li>
        </ul>
      </details>

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
    </GameShell>
  )
}
