import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './Scratch.css'

const PANELS = 3

export default function Scratch() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [amount, setAmount] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const [revealedPanel, setRevealedPanel] = useState(null)
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
    const res = await api.get('/games/scratch/state')
    setState(res)
  }

  useEffect(() => { fetchState() }, [])

  const handleBuy = async () => {
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/scratch/buy', { amount: paise / 100 })
      setState(res)
      setAmount('')
      setRevealedPanel(null)
      showToast('info', 'Card bought — scratch to reveal')
    } catch (e) {
      showToast('error', e.message || 'Buy failed')
    }
  }

  const handleReveal = async (panelIdx) => {
    if (revealing) return
    setRevealing(true)
    setRevealedPanel(panelIdx)

    try {
      await api.post('/games/scratch/reveal')
      const res = await api.get('/games/scratch/state')
      setState(res)

      const active = res.active
      if (active) {
        if (active.win > 0) {
          showToast('success', `Won ${money(active.win)}! ${active.panels.join(' ')}`)
        } else {
          showToast('error', 'No match — try again')
        }
      }
    } catch (e) {
      showToast('error', e.message || 'Reveal failed')
    } finally {
      setRevealing(false)
    }
  }

  const activeCard = state?.active
  const isRevealed = activeCard?.revealed ?? false

  return (
    <GameShell
      icon="ticket"
      title="Scratch"
      tagline="Scratch to reveal"
      accent="#42d7a7"
      toast={toast}
      onRefresh={refresh}
    >
      <div className="scratch-main">
        {!activeCard ? (
          <section className="scratch-buy">
            <label>Card Price (₹)</label>
            <div className="scratch-input-row">
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
              <button type="button" className="scratch-btn-buy" onClick={handleBuy} disabled={!amount || spinning}>
                <Icon name="play" size={16} strokeWidth={2.5} /> BUY CARD
              </button>
            </div>
            <div className="scratch-quick-bets">
              {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 10) && v <= (state?.rules?.maxBet || 10000)).map(v => (
                <button key={v} type="button" onClick={() => setAmount(String(v))}>₹{v}</button>
              ))}
            </div>
          </section>
        ) : (
          <section className="scratch-play">
            <div className="scratch-card">
              <div className="scratch-panels">
                {Array.from({ length: PANELS }).map((_, i) => {
                  const isRevealingNow = revealing && revealedPanel === i
                  const showSymbol = isRevealed || isRevealingNow
                  const symbol = showSymbol ? activeCard.panels[i] : '?'
                  return (
                    <div
                      key={i}
                      className={`scratch-panel ${showSymbol ? 'revealed' : ''} ${isRevealingNow ? 'revealing' : ''}`}
                      onClick={() => !isRevealed && !revealing && handleReveal(i)}
                    >
                      {symbol}
                    </div>
                  )
                })}
              </div>
              {activeCard.win > 0 && (
                <div className="scratch-win-banner">
                  <Icon name="circleCheck" size={24} strokeWidth={3} />
                  <span>Won {money(activeCard.win)}! ({activeCard.multiplier}x)</span>
                </div>
              )}
            </div>
            {!isRevealed && (
              <div className="scratch-hint">Tap a panel to scratch</div>
            )}
          </section>
        )}

        <details className="scratch-rules">
          <summary>How to play</summary>
          <ul>
            <li>Buy a card with <strong>3 hidden panels</strong></li>
            <li>Tap panels to <strong>reveal symbols</strong></li>
            <li>Match all <strong>3 identical symbols</strong> to win</li>
            <li>Payout = stake × symbol multiplier</li>
          </ul>
        </details>

        <div className="scratch-history">
          <h3>Recent Cards</h3>
          {state?.recent?.length ? (
            <div className="scratch-history-list">
              {state.recent.slice(0, 15).map(b => (
                <div key={b.id} className="scratch-history-item">
                  <span className="scratch-hist-panels">{b.panels?.join(' ') || '—'}</span>
                  <span>₹{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)} (${b.multiplier}x)` : 'Lost'}
                  </span>
                  <span className="scratch-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="scratch-empty">No cards yet</p>
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