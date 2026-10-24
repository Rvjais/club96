import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import './Blackjack.css'

const SUIT_COLORS = { '♠': '#1a1a1a', '♥': '#dc2626', '♦': '#dc2626', '♣': '#1a1a1a' }

function cardClass(suit) {
  const c = SUIT_COLORS[suit] ?? '#1a1a1a'
  return suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black'
}

export default function Blackjack() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [active, setActive] = useState(null)
  const [amount, setAmount] = useState('')
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
    const res = await api.get('/games/blackjack/state')
    setState(res.data)
    setActive(res.data.active)
  }

  useEffect(() => { fetchState() }, [])

  const handleDeal = async () => {
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/blackjack/deal', { amount: paise / 100 })
      setState(res.data)
      setActive(res.data.active)
      setAmount('')
      showToast('info', `Dealt: ${active?.playerCards?.map(c => c.rank + c.suit).join(' ')} (${active?.playerValue})`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Deal failed')
    }
  }

  const handleHit = async () => {
    try {
      const res = await api.post('/games/blackjack/hit')
      setState(res.data)
      setActive(res.data.active)
      if (res.data.hit?.bust) {
        showToast('error', `Bust! Drew ${res.data.hit.card.rank}${res.data.hit.card.suit}`)
      } else {
        showToast('info', `Drew ${res.data.hit.card.rank}${res.data.hit.card.suit} → ${res.data.hit.value}`)
      }
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Hit failed')
    }
  }

  const handleStand = async () => {
    try {
      const res = await api.post('/games/blackjack/stand')
      setState(res.data)
      setActive(null)
      const r = res.data.recent?.[0]
      if (r?.result === 'blackjack') showToast('success', 'Blackjack! 🃏')
      else if (r?.result === 'dealerBust') showToast('success', 'Dealer bust! You win!')
      else if (r?.result === 'playerWins') showToast('success', 'You win!')
      else if (r?.result === 'dealerWins') showToast('error', 'Dealer wins')
      else showToast('info', 'Push — bet returned')
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Stand failed')
    }
  }

  const handleDouble = async () => {
    try {
      const res = await api.post('/games/blackjack/double')
      setState(res.data)
      setActive(null)
      const r = res.data.recent?.[0]
      showToast(r.win > 0 ? 'success' : 'error', r.result === 'bust' ? 'Bust on double!' : `Doubled — ${r.result}`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Double failed')
    }
  }

  const renderCard = (c, hidden = false) => (
    <div className={`bj-card ${hidden ? 'bj-card-hidden' : ''}`}>
      {hidden ? (
        <div className="bj-card-back">♠</div>
      ) : (
        <>
          <div className={`bj-card-rank ${cardClass(c.suit)}`}>{c.rank}</div>
          <div className={`bj-card-suit ${cardClass(c.suit)}`}>{c.suit}</div>
        </>
      )}
    </div>
  )

  return (
    <div className="bj-root">
      <header className="bj-header">
        <div className="bj-title">
          <Icon name="spade" size={22} strokeWidth={2.2} />
          <span>Blackjack</span>
        </div>
        <div className="bj-balance">
          <span>₹{money(balance)}</span>
          <button className={`bj-refresh ${spinning ? 'spin' : ''}`} onClick={refresh} disabled={spinning} aria-label="Refresh">
            <Icon name="refresh" size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="bj-main">
        {!active ? (
          <section className="bj-deal">
            <label>Bet Amount (₹)</label>
            <div className="bj-input-row">
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
              <button type="button" className="bj-btn-deal" onClick={handleDeal} disabled={!amount || spinning}>
                <Icon name="play" size={16} strokeWidth={2.5} /> DEAL
              </button>
            </div>
            <div className="bj-quick-bets">
              {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 10) && v <= (state?.rules?.maxBet || 10000)).map(v => (
                <button key={v} type="button" onClick={() => setAmount(String(v))}>₹{v}</button>
              ))}
            </div>
          </section>
        ) : (
          <section className="bj-play">
            <div className="bj-hands">
              <div className="bj-hand bj-hand-dealer">
                <div className="bj-hand-label">Dealer</div>
                <div className="bj-hand-cards">
                  {active.dealerCards.map((c, i) => renderCard(c, i === 0 && active.status === 'active'))}
                </div>
                <div className="bj-hand-value">
                  {active.status === 'active' ? '?' : active.dealerValue}
                </div>
              </div>
              <div className="bj-hand bj-hand-player">
                <div className="bj-hand-label">Player</div>
                <div className="bj-hand-cards">
                  {active.playerCards.map(c => renderCard(c))}
                </div>
                <div className="bj-hand-value">{active.playerValue}</div>
              </div>
            </div>

            <div className="bj-actions">
              <button type="button" className="bj-btn-action bj-btn-hit" onClick={handleHit} disabled={active.status !== 'active'}>
                <Icon name="chevronUp" size={18} strokeWidth={3} />
                <span>HIT</span>
              </button>
              <button type="button" className="bj-btn-action bj-btn-stand" onClick={handleStand} disabled={active.status !== 'active'}>
                <Icon name="chevronDown" size={18} strokeWidth={3} />
                <span>STAND</span>
              </button>
              {active.playerCards.length === 2 && active.status === 'active' && (
                <button type="button" className="bj-btn-action bj-btn-double" onClick={handleDouble}>
                  <Icon name="plus" size={18} strokeWidth={3} />
                  <span>DOUBLE</span>
                </button>
              )}
            </div>
          </section>
        )}

        <details className="bj-rules">
          <summary>How to play</summary>
          <ul>
            <li>Beat the dealer without going over <strong>21</strong></li>
            <li>Blackjack pays <strong>3:2</strong></li>
            <li>Dealer stands on <strong>17</strong></li>
            <li>Ace counts as 1 or 11</li>
          </ul>
        </details>

        <div className="bj-history">
          <h3>Recent Hands</h3>
          {state?.recent?.length ? (
            <div className="bj-history-list">
              {state.recent.slice(0, 15).map(b => (
                <div key={b.id} className="bj-history-item">
                  <span className="bj-hist-cards">{handLabels(b.playerCards)}</span>
                  <span>₹{money(b.amount / 100)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win / 100)} (${b.result})` : 'Lost'}
                  </span>
                  <span className="bj-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="bj-empty">No hands yet</p>
          )}
        </div>
      </main>

      <BottomNav onSoon={text => showToast('info', text)} />

      {toast && (
        <div key={toast.id} className={`bj-toast bj-toast-${toast.kind}`} role="status">
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
        You need at least <strong>₹{money(minPlay)}</strong> in your wallet to play.
        Your balance is <strong>₹{money(balance)}</strong>.
      </Popup>
    </div>
  )
}

function handLabels(cards) {
  if (!cards || !cards.length) return ''
  return cards.map(c => c.rank + c.suit).join(' ')
}