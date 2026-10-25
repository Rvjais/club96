import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './TeenPatti.css'

const SUIT_COLORS = { '♠': '#1a1a1a', '♥': '#dc2626', '♦': '#dc2626', '♣': '#1a1a1a' }

function cardClass(suit) {
  const c = SUIT_COLORS[suit] ?? '#1a1a1a'
  return suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black'
}

function renderCard(c) {
  return (
    <div className="tp-card">
      <div className={`tp-card-rank ${cardClass(c.suit)}`}>{c.rank}</div>
      <div className={`tp-card-suit ${cardClass(c.suit)}`}>{c.suit}</div>
    </div>
  )
}

export default function TeenPatti() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [active, setActive] = useState(null)
  const [ante, setAnte] = useState('')
  const [pairPlus, setPairPlus] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
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
    const res = await api.get('/games/teen-patti/state')
    setState(res)
    setActive(res.active)
  }

  useEffect(() => { fetchState() }, [])

  const handleDeal = async () => {
    const antePaise = Math.round(parseFloat(ante) * 100)
    const ppPaise = Math.round(parseFloat(pairPlus) * 100)
    if (!antePaise || antePaise < 100) return showToast('error', 'Enter ante amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/teen-patti/deal', { ante: antePaise / 100, pairPlus: ppPaise / 100 })
      setState(res)
      setActive(res.active)
      setAnte('')
      setPairPlus('')
      showToast('info', `Dealt: ${active?.playerCards?.join(' ')} — ${active?.playerHand}`)
    } catch (e) {
      showToast('error', e.message || 'Deal failed')
    }
  }

  const handlePlay = async () => {
    try {
      const res = await api.post('/games/teen-patti/play')
      setState(res)
      setActive(null)
      const r = res.recent?.[0]
      showToast(r.win > 0 ? 'success' : 'error', r.result === 'folded' ? 'Folded' : `${r.result} — +${money(r.win)}`)
    } catch (e) {
      showToast('error', e.message || 'Play failed')
    }
  }

  const handleFold = async () => {
    try {
      const res = await api.post('/games/teen-patti/fold')
      setState(res)
      setActive(null)
      showToast('info', 'Folded — ante lost')
    } catch (e) {
      showToast('error', e.message || 'Fold failed')
    }
  }

  const pairPlusOptions = { 0: 'High Card', 1: 'Pair (1:1)', 2: 'Color (3:1)', 3: 'Sequence (5:1)', 4: 'Pure Sequence (30:1)', 5: 'Trial (40:1)' }

  return (
    <GameShell
      icon="crown"
      title="Teen Patti"
      tagline="Three-card duel"
      accent="#f2a33c"
      toast={toast}
      onRefresh={refresh}
    >
      <div className="tp-main">
        {!active ? (
          <section className="tp-deal">
            <div className="tp-inputs">
              <div className="tp-input-group">
                <label>Ante (₹)</label>
                <input
                  type="number"
                  step="10"
                  min={state?.rules?.minBet || 10}
                  max={state?.rules?.maxBet || 10000}
                  value={ante}
                  onChange={e => setAnte(e.target.value)}
                  placeholder="Ante"
                  inputMode="decimal"
                />
              </div>
              <div className="tp-input-group">
                <label>Pair+ (₹)</label>
                <input
                  type="number"
                  step="10"
                  min={0}
                  max={state?.rules?.maxBet || 10000}
                  value={pairPlus}
                  onChange={e => setPairPlus(e.target.value)}
                  placeholder="Pair+ side bet"
                  inputMode="decimal"
                />
              </div>
            </div>
            <button type="button" className="tp-btn-deal" onClick={handleDeal} disabled={!ante || spinning}>
              <Icon name="play" size={16} strokeWidth={2.5} /> DEAL
            </button>
            <div className="tp-quick">
              {[10, 50, 100, 500].map(v => (
                <button key={v} type="button" onClick={() => setAnte(String(v))}>Ante ₹{v}</button>
              ))}
            </div>
          </section>
        ) : (
          <section className="tp-play">
            <div className="tp-hands">
              <div className="tp-hand tp-hand-player">
                <div className="tp-hand-label">PLAYER</div>
                <div className="tp-hand-cards">{active.playerCards.map(renderCard)}</div>
                <div className="tp-hand-value">{active.playerHand}</div>
              </div>
              <div className="tp-hand tp-hand-dealer">
                <div className="tp-hand-label">DEALER</div>
                <div className="tp-hand-cards">{active.dealerCards.map(c => renderCard({ rank: '?', suit: '♠' }))}</div>
                <div className="tp-hand-value">?</div>
              </div>
            </div>

            <div className="tp-actions">
              <button type="button" className="tp-btn-action tp-btn-play" onClick={handlePlay} disabled={active.status !== 'active'}>
                <Icon name="play" size={18} strokeWidth={3} />
                <span>PLAY</span>
              </button>
              <button type="button" className="tp-btn-action tp-btn-fold" onClick={handleFold} disabled={active.status !== 'active'}>
                <Icon name="chevronDown" size={18} strokeWidth={3} />
                <span>FOLD</span>
              </button>
            </div>
          </section>
        )}

        <details className="tp-rules">
          <summary>How to play</summary>
          <ul>
            <li>Place <strong>Ante</strong> and optional <strong>Pair+</strong> side bet</li>
            <li>Get 3 cards; decide to <strong>Play</strong> (match ante) or <strong>Fold</strong></li>
            <li>Highest 3-card hand wins: Trial &gt; Pure Seq &gt; Sequence &gt; Color &gt; Pair &gt; High Card</li>
            <li>Pair+ pays on your hand only, regardless of dealer</li>
          </ul>
        </details>

        <div className="tp-history">
          <h3>Recent Hands</h3>
          {state?.recent?.length ? (
            <div className="tp-history-list">
              {state.recent.slice(0, 15).map(b => (
                <div key={b.id} className="tp-history-item">
                  <span className="tp-hist-cards">{b.playerCards?.join(' ') || '—'}</span>
                  <span>₹{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)} (${b.result})` : 'Lost'}
                  </span>
                  <span className="tp-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="tp-empty">No hands yet</p>
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