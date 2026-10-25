import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { useSiteConfig } from '../../lib/siteConfig'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import './HiLo.css'

const SUIT_ICONS = { h: '♥', d: '♦', c: '♣', s: '♠' }
const SUIT_COLORS = { h: '#e53e3e', d: '#e53e3e', c: '#fff', s: '#fff' }
const SUIT_BG = { h: 'rgba(229,62,62,0.1)', d: 'rgba(229,62,62,0.1)', c: 'rgba(255,255,255,0.1)', s: 'rgba(255,255,255,0.1)' }

function parseCard(card) {
  const suit = card.slice(-1)
  const rank = card.slice(0, -1)
  return { rank, suit }
}

function rankLabel(rank) {
  return rank === '10' ? '10' : rank
}

export default function HiLo() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [state, setState] = useState(null)
  const [active, setActive] = useState(null)
  const [amount, setAmount] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [guessing, setGuessing] = useState(false)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [lastGuess, setLastGuess] = useState(null)
  const [lastResult, setLastResult] = useState(null)

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
    const res = await api.get('/games/hi-lo/state')
    setState(res.data)
    setActive(res.data.active)
  }

  useEffect(() => { fetchState() }, [])

  const handleStart = async () => {
    const paise = Math.round(parseFloat(amount) * 100)
    if (!paise || paise < 100) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    try {
      const res = await api.post('/games/hi-lo/start', { amount: paise / 100 })
      setState(res.data)
      setActive(res.data.active)
      setAmount('')
      showToast('info', `First card: ${rankLabel(parseCard(res.data.active.currentCard).rank)}${SUIT_ICONS[parseCard(res.data.active.currentCard).suit]}`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Failed to start')
    }
  }

  const handleGuess = async (direction) => {
    if (!active || guessing) return
    setGuessing(true)
    setLastGuess(direction)

    try {
      const res = await api.post('/games/hi-lo/guess', { direction })
      setState(res.data)
      setActive(res.data.active)

      if (res.data.active?.status === 'lost') {
        setAnimating(true)
        setLastResult({ card: active.deck[0], won: false })
        setTimeout(() => { setAnimating(false); setLastResult(null) }, 1500)
        showToast('error', `Hit ${rankLabel(parseCard(active.deck[0]).rank)} — Lost!`)
      } else if (res.data.active) {
        setAnimating(true)
        setLastResult({ card: active.deck[0], won: true, streak: res.data.active.streak })
        setTimeout(() => { setAnimating(false); setLastResult(null) }, 1200)
        showToast('success', `Correct! Streak: ${res.data.active.streak}`)
      }
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Guess failed')
    } finally {
      setGuessing(false)
    }
  }

  const handleCashout = async () => {
    if (!active || active.streak === 0) return
    try {
      const res = await api.post('/games/hi-lo/cashout')
      setState(res.data)
      setActive(null)
      showToast('success', `Cashed out ${money(res.data.bet.win)} (${res.data.bet.multiplier}x)`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Cashout failed')
    }
  }

  const currentCard = active ? parseCard(active.currentCard) : null
  const nextMultiplier = active ? state?.rules?.nextMultiplier?? (active.streak < 15 ? [1.95,2.0,2.1,2.25,2.5,3.0,4.0,5.5,8.0,12.0,18.0,28.0,45.0,70.0,110.0][active.streak] : 110.0) : null

  return (
    <div className="hilo-root">
      <header className="hilo-header">
        <div className="hilo-title">
          <Icon name="sortUp" size={22} strokeWidth={2.2} />
          <span>Hi-Lo</span>
        </div>
        <div className="hilo-balance">
          <span>₹{money(balance)}</span>
          <button className={`hilo-refresh ${spinning ? 'spin' : ''}`} onClick={refresh} disabled={spinning} aria-label="Refresh">
            <Icon name="refresh" size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="hilo-main">
        {/* Current card display */}
        <div className="hilo-card-area">
          {active ? (
            <div className="hilo-current-card" style={{ background: SUIT_BG[currentCard.suit] }}>
              <div className="hilo-card-rank" style={{ color: SUIT_COLORS[currentCard.suit] }}>
                {rankLabel(currentCard.rank)}
              </div>
              <div className="hilo-card-suit" style={{ color: SUIT_COLORS[currentCard.suit] }}>
                {SUIT_ICONS[currentCard.suit]}
              </div>
            </div>
          ) : (
            <div className="hilo-empty-card">
              <Icon name="sortUp" size={48} strokeWidth={1.5} />
              <p>No active round</p>
            </div>
          )}

          {/* Streak & multiplier */}
          <div className="hilo-streak">
            <div className="hilo-streak-item">
              <span className="hilo-streak-label">STREAK</span>
              <span className="hilo-streak-value">{active?.streak ?? 0}</span>
            </div>
            <div className="hilo-streak-item">
              <span className="hilo-streak-label">CURRENT</span>
              <span className="hilo-streak-value">{active?.multiplier?.toFixed(2) ?? '1.00'}x</span>
            </div>
            <div className="hilo-streak-item">
              <span className="hilo-streak-label">NEXT</span>
              <span className="hilo-streak-value next">{nextMultiplier?.toFixed(2) ?? '1.95'}x</span>
            </div>
            <div className="hilo-streak-item">
              <span className="hilo-streak-label">POTENTIAL</span>
              <span className="hilo-streak-value potential">₹{money((active?.amount) * (nextMultiplier ?? 1))}</span>
            </div>
          </div>

          {/* Animation overlay */}
          {animating && lastResult && (
            <div className={`hilo-anim ${lastResult.won ? 'win' : 'lose'}`}>
              <div className="hilo-anim-card" style={{ background: SUIT_BG[parseCard(lastResult.card).suit] }}>
                <div className="hilo-anim-rank" style={{ color: SUIT_COLORS[parseCard(lastResult.card).suit] }}>
                  {rankLabel(parseCard(lastResult.card).rank)}
                </div>
                <div className="hilo-anim-suit" style={{ color: SUIT_COLORS[parseCard(lastResult.card).suit] }}>
                  {SUIT_ICONS[parseCard(lastResult.card).suit]}
                </div>
              </div>
              <div className="hilo-anim-text">
                {lastResult.won ? (
                  <>
                    <Icon name="circleCheck" size={28} strokeWidth={3} />
                    <span>Correct! Streak {lastResult.streak}</span>
                  </>
                ) : (
                  <>
                    <Icon name="circleAlert" size={28} strokeWidth={3} />
                    <span>Same rank — Lost!</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!active ? (
          <div className="hilo-start">
            <label>Bet Amount (₹)</label>
            <div className="hilo-input-row">
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
              <button type="button" className="hilo-btn-start" onClick={handleStart} disabled={!amount || spinning}>
                <Icon name="play" size={16} strokeWidth={2.5} /> START
              </button>
            </div>
            <div className="hilo-quick">
              {[10, 50, 100, 500, 1000].filter(v => v >= (state?.rules?.minBet || 10) && v <= (state?.rules?.maxBet || 10000)).map(v => (
                <button key={v} type="button" onClick={() => setAmount(String(v))}>₹{v}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="hilo-actions">
            <button
              type="button"
              className="hilo-btn-guess higher"
              onClick={() => handleGuess('higher')}
              disabled={guessing}
            >
              <Icon name="chevronUp" size={20} strokeWidth={3} />
              <span>HIGHER</span>
              <span className="hilo-chance">~46%</span>
            </button>
            <button
              type="button"
              className="hilo-btn-guess lower"
              onClick={() => handleGuess('lower')}
              disabled={guessing}
            >
              <Icon name="chevronDown" size={20} strokeWidth={3} />
              <span>LOWER</span>
              <span className="hilo-chance">~46%</span>
            </button>
            {active.streak > 0 && (
              <button type="button" className="hilo-btn-cashout" onClick={handleCashout} disabled={guessing}>
                <Icon name="wallet" size={18} strokeWidth={2.2} />
                CASH OUT {active.multiplier.toFixed(2)}x
              </button>
            )}
          </div>
        )}

        {/* Rules */}
        <details className="hilo-rules">
          <summary>How to play</summary>
          <ul>
            <li>Guess if the next card is <strong>Higher</strong> or <strong>Lower</strong></li>
            <li>Same rank = <strong>Loss</strong> (house edge)</li>
            <li>Each correct guess increases your multiplier</li>
            <li>Cash out anytime, or risk it for higher streak</li>
            <li>Ace is low (value 1), King is high (13)</li>
          </ul>
        </details>

        {/* History */}
        <div className="hilo-history">
          <h3>Recent Rounds</h3>
          {state?.recent?.length ? (
            <div className="hilo-history-list">
              {state.recent.slice(0, 15).map(b => (
                <div key={b.id} className="hilo-history-item">
                  <span className="hilo-hist-streak">{b.streak} gems</span>
                  <span>₹{money(b.amount)}</span>
                  <span className={b.status === 'won' ? 'win' : 'lose'}>
                    {b.status === 'won' ? `+${money(b.win)} (${b.multiplier}x)` : 'Lost'}
                  </span>
                  <span className="hilo-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hilo-empty">No rounds yet</p>
          )}
        </div>
      </main>

      <BottomNav onSoon={text => showToast('info', text)} />

      {toast && (
        <div key={toast.id} className={`hilo-toast hilo-toast-${toast.kind}`} role="status">
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