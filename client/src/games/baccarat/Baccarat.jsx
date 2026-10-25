import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './Baccarat.css'

const SUIT_COLORS = { '♠': '#1a1a1a', '♥': '#dc2626', '♦': '#dc2626', '♣': '#1a1a1a' }

function cardClass(suit) {
  const c = SUIT_COLORS[suit] ?? '#1a1a1a'
  return suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black'
}

export default function Baccarat() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
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
    const res = await api.get('/games/baccarat/state')
    setState(res)
  }

  useEffect(() => { fetchState() }, [])

  const handleBet = async (betOn) => {
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/baccarat/bet', { betOn, amount: paise / 100 })
      setState(res)
      setAmount('')
      const r = res.recent?.[0]
      const labels = { player: 'Player', banker: 'Banker', tie: 'Tie' }
      showToast(r.win > 0 ? 'success' : 'error', `${labels[resultLabel(r.result)]} won — ${r.win > 0 ? `+${money(r.win)}` : 'Lost'}`)
    } catch (e) {
      showToast('error', e.message || 'Bet failed')
    }
  }

  function resultLabel(r) {
    return r === 'player' ? 'player' : r === 'banker' ? 'banker' : 'tie'
  }

  const renderCard = (c) => (
    <div className="bc-card">
      <div className={`bc-card-rank ${cardClass(c.suit)}`}>{c.rank}</div>
      <div className={`bc-card-suit ${cardClass(c.suit)}`}>{c.suit}</div>
    </div>
  )

  return (
    <GameShell
      icon="diamond"
      title="Baccarat"
      tagline="Player · Banker · Tie"
      accent="#ff4757"
      toast={toast}
      onRefresh={refresh}
    >
      <div className="bc-main">
        <section className="bc-table">
          <div className="bc-seats">
            <div className={`bc-seat ${state?.active?.betOn === 'player' ? 'active' : ''}`} onClick={() => handleBet('player')}>
              <div className="bc-seat-label">PLAYER</div>
              <div className="bc-seat-payout">1:1</div>
            </div>
            <div className={`bc-seat ${state?.active?.betOn === 'banker' ? 'active' : ''}`} onClick={() => handleBet('banker')}>
              <div className="bc-seat-label">BANKER</div>
              <div className="bc-seat-payout">0.95:1</div>
            </div>
            <div className={`bc-seat ${state?.active?.betOn === 'tie' ? 'active' : ''}`} onClick={() => handleBet('tie')}>
              <div className="bc-seat-label">TIE</div>
              <div className="bc-seat-payout">8:1</div>
            </div>
          </div>

          {state?.active && (
            <div className="bc-deal">
              <div className="bc-hand">
                <div className="bc-hand-label">PLAYER</div>
                <div className="bc-hand-cards">{state.active.playerCards.map(c => renderCard(c))}</div>
                <div className="bc-hand-value">{state.active.playerValue}</div>
              </div>
              <div className="bc-hand">
                <div className="bc-hand-label">BANKER</div>
                <div className="bc-hand-cards">{state.active.bankerCards.map(c => renderCard(c))}</div>
                <div className="bc-hand-value">{state.active.bankerValue}</div>
              </div>
              <div className="bc-result">
                <span className={`bc-result-text ${state.active.result === state.active.betOn ? 'win' : 'lose'}`}>
                  {state.active.result.charAt(0).toUpperCase() + state.active.result.slice(1)} wins
                </span>
              </div>
            </div>
          )}

          <div className="bc-bet">
            <label>Bet Amount (₹)</label>
            <div className="bc-input-row">
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
            </div>
            <div className="bc-quick-bets">
              {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 10) && v <= (state?.rules?.maxBet || 10000)).map(v => (
                <button key={v} type="button" onClick={() => setAmount(String(v))}>₹{v}</button>
              ))}
            </div>
          </div>
        </section>

        <details className="bc-rules">
          <summary>How to play</summary>
          <ul>
            <li>Bet on <strong>Player</strong>, <strong>Banker</strong>, or <strong>Tie</strong></li>
            <li>Closest to <strong>9</strong> wins</li>
            <li>10, J, Q, K = 0; Ace = 1; other cards = face value</li>
            <li>Banker pays <strong>0.95:1</strong> (5% commission)</li>
            <li>Tie pays <strong>8:1</strong></li>
          </ul>
        </details>

        <div className="bc-history">
          <h3>Recent Hands</h3>
          {state?.recent?.length ? (
            <div className="bc-history-list">
              {state.recent.slice(0, 15).map(b => (
                <div key={b.id} className="bc-history-item">
                  <span className="bc-hist-cards">{handLabels(b.playerCards)} vs {handLabels(b.bankerCards)}</span>
                  <span>₹{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)} (${b.result})` : 'Lost'}
                  </span>
                  <span className="bc-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="bc-empty">No hands yet</p>
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

function handLabels(cards) {
  if (!cards || !cards.length) return ''
  return cards.map(c => c.rank + c.suit).join(' ')
}