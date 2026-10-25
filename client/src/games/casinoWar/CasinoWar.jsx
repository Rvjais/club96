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
import './CasinoWar.css'

const RESULT_TEXT = {
  playerWins: 'You win!',
  dealerWins: 'Dealer wins',
  warWin: 'WAR — you win!',
  warLoss: 'WAR — you lost',
  surrender: 'Surrendered (half back)',
}

const isRed = (card) => /[♥♦]$/.test(card || '')

export default function CasinoWar() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
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
    const res = await api.get('/games/casino-war/state')
    setRules(res.rules)
    setActive(res.active)
    setHistory(res.history)
  }

  useEffect(() => { fetchState() }, [])

  const bet = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/casino-war/bet', { amount })
      setActive(res.active)
      setHistory(res.history)
      const a = res.active
      const last = res.history?.[0]
      if (!a && last) {
        showToast(last.win > 0 ? 'success' : 'error', `${last.playerCard} vs ${last.dealerCard} — ${RESULT_TEXT[last.result]}`)
        refreshWallet().catch(() => {})
      } else if (a) {
        showToast('info', `Tie! Go to war or surrender — got ${a.playerCard}`)
      }
    } catch (e) {
      showToast('error', e.message || 'Bet failed')
    } finally {
      setBusy(false)
    }
  }

  const war = async () => {
    if (busy || !active) return
    setBusy(true)
    try {
      const res = await api.post('/games/casino-war/war')
      setActive(null)
      setHistory(res.history)
      const last = res.history?.[0]
      showToast(last.win > 0 ? 'success' : 'error', `${last.warPlayerCard} vs ${last.warDealerCard} — ${RESULT_TEXT[last.result]}`)
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.message || 'War failed')
    } finally {
      setBusy(false)
    }
  }

  const surrender = async () => {
    if (busy || !active) return
    setBusy(true)
    try {
      const res = await api.post('/games/casino-war/surrender')
      setActive(null)
      setHistory(res.history)
      showToast('info', 'Surrendered — half your stake is back')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.message || 'Surrender failed')
    } finally {
      setBusy(false)
    }
  }

  // last finished bet for the table display
  const last = !active ? history[0] : null

  // purely-visual key so the card-reveal + emblem animations replay each round
  const roundKey = active
    ? `t${active.playerCard || ''}${active.dealerCard || ''}`
    : last ? `r${last.id || ''}${last.playerCard || ''}${last.warPlayerCard || ''}${last.result || ''}` : 'idle'

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const wars = history.filter(b => b.result === 'warWin' || b.result === 'warLoss').length

  return (
    <GameShell
      icon="crown"
      title="Casino War"
      tagline="Tie? Go to war"
      accent="#ffb347"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="cw-dock">
          {active ? (
            <div className="cw-war-actions">
              <button type="button" className="gs-cta" onClick={war} disabled={busy}>
                <Icon name="zap" size={17} strokeWidth={2.6} /> GO TO WAR
              </button>
              <button type="button" className="gs-btn-ghost cw-surrender" onClick={surrender} disabled={busy}>
                SURRENDER (½)
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
              <button type="button" className="gs-cta" onClick={bet} disabled={busy}>
                <Icon name={busy ? 'refresh' : 'crown'} size={17} strokeWidth={2.6} />
                {busy ? 'Dealing…' : 'BATTLE'}
              </button>
            </>
          )}
        </div>
      )}
    >
      <section className="gs-stage cw-stage">
        <div className="cw-glow" aria-hidden="true" />
        <div className="cw-table" key={roundKey}>
          <div className="cw-seat">
            <span className="cw-seat-label">YOU</span>
            <span className="cw-card-in cw-in-l">
              <CardFace card={active?.playerCard ?? last?.playerCard} back={!(active || last)} />
            </span>
          </div>
          <div className={`cw-vs ${active ? 'cw-vs-war' : ''} ${!active && last ? (last.win > 0 ? 'cw-vs-win' : 'cw-vs-loss') : ''}`}>
            <Icon name="crown" size={active ? 19 : 14} strokeWidth={2.3} />
            <span>{active ? 'WAR!' : 'VS'}</span>
          </div>
          <div className="cw-seat cw-seat-r">
            <span className="cw-card-in cw-in-r">
              <CardFace card={active?.dealerCard ?? last?.dealerCard} back={!(active || last)} />
            </span>
            <span className="cw-seat-label">DEALER</span>
          </div>
        </div>

        {active && (
          <div className="cw-tie-note">
            High-card tie! Raise <strong>{money(active.amount)}</strong> to go to war —
            win pays 1:1 on the ante, the war stake pushes — or surrender and keep half.
          </div>
        )}

        {last && (
          <div className={`gs-banner cw-res ${last.win > 0 && last.result !== 'surrender' ? 'win' : last.result !== 'dealerWins' && last.result !== 'warLoss' ? 'push' : 'loss'}`}>
            {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${last.result === 'surrender' ? money(last.win) : '+' + money(last.win)}` : ''}
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > 0 ? (b.result === 'warWin' ? 'gold' : 'win') : b.result === 'surrender' ? '' : 'loss'}`}>{b.playerCard}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{history.length}</b>
          <span>Battles</span>
        </div>
        <div className="gs-stat">
          <b>{wars || '—'}</b>
          <span>Wars fought</span>
        </div>
        <div className="gs-stat">
          <b>{money(last ? (last.win > 0 ? last.win : last.staked) : 0)}</b>
          <span>Last round</span>
        </div>
      </div>

      <section className="gs-panel gs-hist cw-hist">
        <div className="gs-panel-title"><Icon name="receipt" size={12} strokeWidth={2.4} /> Recent battles</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={`cw-hist-card ${isRed(b.playerCard) ? 'is-red' : 'is-black'}`}>{b.playerCard}</span>
              <span className="cw-hist-line">
                vs {b.dealerCard}
                {(b.result === 'warWin' || b.result === 'warLoss') && <em className="cw-hist-war">· ⚔ {b.warPlayerCard}/{b.warDealerCard}</em>}
              </span>
              <span className="cw-hist-stake">{money(b.staked)}</span>
              <span className={b.result === 'playerWins' || b.result === 'warWin' ? 'win' : b.result === 'surrender' ? 'push' : 'lose'}>
                {b.result === 'surrender' ? `+${money(b.win)}` : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No battles yet</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>One card each — <strong>higher card wins 1:1</strong></li>
          <li><strong>Tie?</strong> Go to war: match your stake to battle again</li>
          <li>Win the war &#8594; ante pays 1:1, war stake pushes</li>
          <li>Or surrender and get <strong>half</strong> the stake back</li>
          <li>Ace is high</li>
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
