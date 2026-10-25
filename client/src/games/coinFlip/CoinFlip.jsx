import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './CoinFlip.css'

const flipped = (side) => (side === 'heads' ? 'H' : 'T')

export default function CoinFlip() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [side, setSide] = useState('heads')
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [face, setFace] = useState('?')
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0
  const flipTimer = useRef(null)

  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000
  const payout = rules?.payout ?? 1.95

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2400)
  }

  const fetchState = async () => {
    const res = await api.get('/games/coin-flip/state')
    setRules(res.rules)
    setHistory(res.history)
  }

  useEffect(() => {
    fetchState()
    return () => clearTimeout(flipTimer.current)
  }, [])

  const bet = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)

    setBusy(true)
    setSpinning(true)
    setFace('?')
    try {
      const res = await api.post('/games/coin-flip/bet', { side, amount })
      // animation: alternate faces while the coin "spins"
      let flips = 0
      clearInterval(flipTimer.current)
      flipTimer.current = setInterval(() => {
        flips += 1
        setFace(flips % 2 === 0 ? 'H' : 'T')
        if (flips >= 8) {
          clearInterval(flipTimer.current)
          setFace(flipped(res.history?.[0]?.result ?? side))
          setSpinning(false)
          const last = res.history?.[0]
          if (last) {
            const text = last.win > 0
              ? `${flipped(last.result)} — won ${money(last.win)}!`
              : `${flipped(last.result)} — lost`
            showToast(last.win > 0 ? 'success' : 'error', text)
          }
          setHistory(res.history)
          setBusy(false)
          refreshWallet().catch(() => {})
        }
      }, 110)
    } catch (e) {
      setSpinning(false)
      setBusy(false)
      showToast('error', e.message || 'Bet failed')
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const last = history[0]
  let streak = 0
  for (const b of history) { if (b.win > 0) streak++; else break }

  return (
    <GameShell
      icon="coins"
      title="Coin Flip"
      tagline="Call the coin"
      accent="#f7c948"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="cfp-dock">
          <div className="cfp-call">
            <button type="button" className={`cfp-side heads ${side === 'heads' ? 'is-on' : ''}`} onClick={() => setSide('heads')}>
              <span className="cfp-side-face">H</span>
              <span className="cfp-side-txt">HEADS<em>{payout}×</em></span>
            </button>
            <button type="button" className={`cfp-side tails ${side === 'tails' ? 'is-on' : ''}`} onClick={() => setSide('tails')}>
              <span className="cfp-side-face">T</span>
              <span className="cfp-side-txt">TAILS<em>{payout}×</em></span>
            </button>
          </div>
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
            {[10, 50, 100, 500, 1000].filter(v => v >= minBet && v <= maxBet).map(v => (
              <button key={v} type="button" className="gs-chip" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="gs-cta" onClick={bet} disabled={busy}>
            <Icon name={spinning ? 'refresh' : 'play'} size={17} strokeWidth={2.6} />
            {spinning ? 'FLIPPING…' : 'FLIP THE COIN'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage cfp-stage">
        <div className="cfp-halo" aria-hidden="true" />
        <div className="cfp-coinwrap">
          <div className={`cfp-coin ${face === 'T' ? 'tails' : ''} ${spinning ? 'spinning' : ''}`}>
            <span className="cfp-coin-face">{face}</span>
            <small className="cfp-coin-sub">{face === 'H' ? 'HEADS' : face === 'T' ? 'TAILS' : 'READY'}</small>
          </div>
          <div className="cfp-coin-shadow" aria-hidden="true" />
        </div>
        {last && (
          <div className={`cfp-last ${last.win > 0 ? 'is-win' : 'is-loss'}`}>
            {last.win > 0 ? `+${money(last.win)}` : `−${money(last.amount)}`}
            <em>{last.result} · {last.side === last.result ? 'called it' : 'missed'}</em>
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.result === 'heads' ? 'gold' : ''}`}>{flipped(b.result)}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{streak > 0 ? `${streak}×` : '—'}</b>
          <span>Win streak</span>
        </div>
        <div className="gs-stat">
          <b>{payout}×</b>
          <span>Pays</span>
        </div>
        <div className="gs-stat">
          <b>{money(last ? (last.win > 0 ? last.win : last.amount) : 0)}</b>
          <span>Last round</span>
        </div>
      </div>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title">Recent flips</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={`cfp-hist-coin ${b.result === 'heads' ? 'gold' : 'silver'}`}>{flipped(b.result)}</span>
              <span>{b.side} {b.side === b.result ? '✓' : '✗'}</span>
              <span className="cfp-hist-stake">{money(b.amount)}</span>
              <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'LOST'}</span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No flips yet — call your first</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Pick <strong>heads</strong> or <strong>tails</strong></li>
          <li>Win pays <strong>{payout}×</strong> the stake</li>
          <li>Fair 50 / 50 shot on every flip</li>
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
