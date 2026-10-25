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
import './ThreeCard.css'

const RESULT_TEXT = {
  playerWins: 'You win',
  dealerWins: 'Dealer wins',
  push: 'Push',
  folded: 'Folded',
  dealerNoQualify: 'Dealer no qualify — ante pays',
}

// informational ladder (same numbers as the old rules text)
const PAIR_PLUS_LADDER = [
  { rank: 'Straight flush', pays: '40:1' },
  { rank: 'Three of a kind', pays: '30:1' },
  { rank: 'Straight', pays: '6:1' },
  { rank: 'Flush', pays: '4:1' },
  { rank: 'Pair', pays: '1:1' },
]

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

  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

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

  // purely-visual fan keys so the staggered deal animations replay each hand
  const playerFanKey = active ? `a${active.playerCards.join('')}` : last ? `l${last.id || ''}` : 'idle'
  const dealerFanKey = last ? `d${last.dealerCards.join('')}` : 'idle'

  const halfAnte = () => setAnte(String(Math.max(minBet, Math.floor((Number(ante) || 0) / 2) || minBet)))
  const doubleAnte = () => setAnte(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(ante) || 0) * 2)))))
  const maxAnte = () => setAnte(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  return (
    <GameShell
      icon="heart"
      title="3 Card Poker"
      tagline="Play or fold"
      accent="#20c997"
      wide
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="tc-dock">
          {active ? (
            <div className="tc-dock-actions">
              <button type="button" className="gs-cta" onClick={play} disabled={busy}>
                <Icon name="play" size={17} strokeWidth={2.8} /> PLAY (match ante {money(active.ante)})
              </button>
              <button type="button" className="gs-btn-ghost tc-fold" onClick={fold} disabled={busy}>
                FOLD
              </button>
            </div>
          ) : (
            <>
              <div className="tc-dock-inputs">
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
                <div className="gs-field tc-pp">
                  <span className="gs-cur">PP</span>
                  <input
                    className="gs-input"
                    type="number"
                    min={0}
                    max={maxBet}
                    value={pairPlus}
                    onChange={e => setPairPlus(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Pair Plus side bet"
                  />
                </div>
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
      <section className="gs-stage tc-stage">
        <div className="tc-glow" aria-hidden="true" />

        <div className="tc-row">
          <span className="tc-seat">DEALER</span>
          <div className="tc-fan tc-fan-dealer" key={dealerFanKey}>
            {dealerShown
              ? last.dealerCards.map((c, i) => <span key={i} className="tc-slot"><CardFace card={c} /></span>)
              : (
                <>
                  <span className="tc-slot"><CardFace back /></span>
                  <span className="tc-slot"><CardFace back /></span>
                  <span className="tc-slot"><CardFace back /></span>
                </>
              )}
          </div>
          {last
            ? <em className={`tc-hand-name ${last.dealerQualified === false ? 'dim' : ''}`}>{last.dealerHand}</em>
            : <em className="tc-note">Q-high to qualify</em>}
        </div>

        <div className="tc-bridge">
          <span className="tc-vs-chip"><Icon name="heart" size={11} strokeWidth={2.6} /> VS</span>
        </div>

        <div className="tc-row tc-row-player">
          <div className={`tc-fan tc-fan-player ${showPlayerCards ? '' : 'tc-fan-idle'}`} key={playerFanKey}>
            {showPlayerCards
              ? (active ?? last).playerCards.map((c, i) => <span key={i} className="tc-slot"><CardFace card={c} /></span>)
              : <span className="tc-slot"><CardFace back /></span>}
          </div>
          {active
            ? <em className="tc-note">your hand</em>
            : last ? <em className="tc-hand-name">{last.playerHand}</em> : null}
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
        <div className="gs-stat tc-stat-txt">
          <b>{last ? last.playerHand : '—'}</b>
          <span>Your last hand</span>
        </div>
      </div>

      <section className="gs-panel tc-ladder">
        <div className="gs-panel-title"><Icon name="gem" size={12} strokeWidth={2.4} /> Pair Plus ladder</div>
        {PAIR_PLUS_LADDER.map(row => (
          <div key={row.rank} className="tc-ladder-row">
            <span>{row.rank}</span>
            <b>{row.pays}</b>
          </div>
        ))}
      </section>

      <section className="gs-panel gs-hist tc-hist">
        <div className="gs-panel-title"><Icon name="history" size={12} strokeWidth={2.4} /> Recent hands</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className="tc-hist-cards">{b.playerCards.join(' ')}</span>
              <span className="tc-hist-hand">{b.playerHand}</span>
              <span className="tc-hist-stake">{money(b.amount)}</span>
              <span className={b.win > b.amount ? 'win' : 'lose'}>
                {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No hands yet</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Place an <strong>ante</strong> (+ optional <strong>Pair Plus</strong>)</li>
          <li><strong>Play</strong> = match your ante; <strong>Fold</strong> = forfeit it</li>
          <li>Dealer needs <strong>Q-high+</strong>: no qualify &#8594; ante pays, play pushes</li>
          <li>Ranks: SF &gt; trips &gt; straight &gt; flush &gt; pair &gt; high</li>
          <li>Pair+: pair 1:1 · flush 4:1 · straight 6:1 · trips 30:1 · SF 40:1</li>
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
