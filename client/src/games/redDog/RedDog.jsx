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
import './RedDog.css'

const RESULT_TEXT = {
  win: 'Between! Bet pays',
  triple: 'Three of a kind! 11×',
  push: 'Push — stake back',
  lose: 'Missed — lost',
}

export default function RedDog() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(null)
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
    const res = await api.get('/games/red-dog/state')
    setRules(res.rules)
    setHistory(res.history)
  }

  useEffect(() => { fetchState() }, [])

  const deal = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    setReveal(null)
    try {
      const res = await api.post('/games/red-dog/deal', { amount })
      const b = res.history?.[0]
      setReveal(b)
      setHistory(res.history)
      if (b) {
        const suffix = b.result === 'win' ? ` ${b.multiplier}×` : ''
        showToast(b.win > b.amount ? 'success' : b.result === 'push' ? 'info' : 'error', `${RESULT_TEXT[b.result]}${suffix}`)
      }
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.message || 'Deal failed')
    } finally {
      setBusy(false)
    }
  }

  const spread = reveal && !reveal.spread && reveal.spread !== 0
    ? null
    : reveal?.spread

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const last = history[0]
  let streak = 0
  for (const b of history) { if (b.win > b.amount) streak++; else break }

  return (
    <GameShell
      icon="spade"
      title="Red Dog"
      tagline="Shoot the spread"
      accent="#ff6b6b"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="rd-dock">
          <div className="gs-input-row">
            <div className="gs-field">
              <span className="gs-cur">₹</span>
              <input
                className="gs-input"
                type="number"
                min={minBet}
                max={maxBet}
                value={stake}
                onChange={e => setStake(e.target.value)}
                inputMode="decimal"
                aria-label="Stake"
              />
            </div>
            <button type="button" className="gs-chip" onClick={halfStake}>1/2</button>
            <button type="button" className="gs-chip" onClick={doubleStake}>2×</button>
            <button type="button" className="gs-chip" onClick={maxStake}>MAX</button>
          </div>
          <div className="gs-quick">
            {[10, 50, 100, 500].filter(v => v >= minBet && v <= maxBet).map(v => (
              <button key={v} type="button" className="gs-chip" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="gs-cta" onClick={deal} disabled={busy}>
            <Icon name="shuffle" size={17} strokeWidth={2.6} />
            {busy ? 'Dealing…' : 'DEAL'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage rd-stage">
        <div className="rd-felt" aria-hidden="true" />
        <div
          className="rd-table"
          key={reveal?.id ?? 'rd-idle'}
        >
          <div className="rd-cards">
            <CardFace card={reveal?.card1} back={!reveal?.card1} />
            <div className="rd-middle">
              <div className={`rd-spreadzone ${reveal && (reveal.result === 'win' || reveal.result === 'triple') ? 'win-zone' : ''}`}>
                {reveal?.result === 'push'
                  ? <span className="rd-spread-tag push">PUSH</span>
                  : spread != null && spread > 0
                    ? (
                      <span className="rd-spread-tag gap">
                        <b>{spread}</b>
                        <i>gap</i>
                      </span>
                      )
                    : <span className="rd-spread-tag edge">↔</span>}
                {reveal && reveal.result !== 'push' && spread != null && spread > 0 && spread <= 8 && (
                  <div className="rd-dots">
                    {Array.from({ length: spread }).map((_, j) => <i key={j} />)}
                  </div>
                )}
              </div>
              <CardFace card={reveal?.card3} back={!reveal?.card3} dim={reveal?.result === 'lose'} />
              <small>third card</small>
            </div>
            <CardFace card={reveal?.card2} back={!reveal?.card2} />
          </div>
        </div>
        {reveal && (
          <div className={`gs-banner ${reveal.win > reveal.amount ? 'win' : reveal.result === 'push' ? 'push' : 'loss'}`}>
            {RESULT_TEXT[reveal.result]}{reveal.result === 'win' ? ` ${reveal.multiplier}×` : ''}
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.result === 'win' || b.result === 'triple' ? 'gold' : b.result === 'push' ? '' : 'loss'}`}>
            {b.result === 'win'
              ? `${b.multiplier}×`
              : b.result === 'triple'
                ? '11×'
                : b.result === 'push'
                  ? 'PUSH'
                  : 'MISS'}
          </span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{streak > 0 ? `${streak}×` : '—'}</b>
          <span>Win streak</span>
        </div>
        <div className="gs-stat">
          <b>{rules?.pairTriple ?? 11}×</b>
          <span>Top pay</span>
        </div>
        <div className="gs-stat">
          <b>{money(last ? (last.win > last.amount ? last.win : last.amount) : 0)}</b>
          <span>Last round</span>
        </div>
      </div>

      <section className="gs-panel">
        <div className="gs-panel-title">Payout ladder</div>
        <div className="rd-ladder">
          <div className="rd-lrow">
            <span><Icon name="arrowRight" size={13} strokeWidth={2.4} /> 1 gap</span>
            <b>5×</b>
          </div>
          <div className="rd-lrow">
            <span><Icon name="arrowRight" size={13} strokeWidth={2.4} /> 2 gaps</span>
            <b>4×</b>
          </div>
          <div className="rd-lrow">
            <span><Icon name="arrowRight" size={13} strokeWidth={2.4} /> 3 gaps</span>
            <b>2×</b>
          </div>
          <div className="rd-lrow">
            <span><Icon name="arrowRight" size={13} strokeWidth={2.4} /> 4+ gaps</span>
            <b>1×</b>
          </div>
          <div className="rd-lrow">
            <span><Icon name="circleHalf" size={13} strokeWidth={2.4} /> Consecutive / pair</span>
            <b className="rd-push">PUSH</b>
          </div>
          <div className="rd-lrow">
            <span><Icon name="crown" size={13} strokeWidth={2.4} /> Pair turns trips</span>
            <b>11×</b>
          </div>
        </div>
      </section>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title">Recent deals</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={`rd-hist-badge ${b.result === 'win' ? 'w' : b.result === 'push' ? 'p' : 'l'}`}>
                <Icon name={b.result === 'win' ? 'trophy' : b.result === 'push' ? 'circleHalf' : 'spade'} size={13} strokeWidth={2.2} />
              </span>
              <span className="rd-hist-cards">{b.card1} {b.card2} → {b.card3}</span>
              <span className="rd-hist-stake">{money(b.amount)}</span>
              <span className={b.result === 'win' ? 'win' : b.result === 'push' ? 'push' : 'lose'}>
                {b.win > b.amount ? `+${money(b.win - b.amount)}` : b.result === 'push' ? 'Push' : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No deals yet — shoot the spread</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Two cards are dealt; a third card decides</li>
          <li>Falls <strong>between</strong> → paid by the spread:</li>
          <li>1 gap <strong>5×</strong> · 2 gaps <strong>4×</strong> · 3 gaps <strong>2×</strong> · 4+ gaps <strong>1×</strong></li>
          <li>Consecutive cards and pairs <strong>push</strong></li>
          <li>A pair that becomes trips pays <strong>11×</strong></li>
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
