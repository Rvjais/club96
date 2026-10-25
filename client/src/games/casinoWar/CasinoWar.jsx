import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
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

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/casino-war/state')
    setRules(res.data.rules)
    setActive(res.data.active)
    setHistory(res.data.history)
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
      setActive(res.data.active)
      setHistory(res.data.history)
      const a = res.data.active
      const last = res.data.history?.[0]
      if (!a && last) {
        showToast(last.win > 0 ? 'success' : 'error', `${last.playerCard} vs ${last.dealerCard} — ${RESULT_TEXT[last.result]}`)
        refreshWallet().catch(() => {})
      } else if (a) {
        showToast('info', `Tie! Go to war or surrender — got ${a.playerCard}`)
      }
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Bet failed')
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
      setHistory(res.data.history)
      const last = res.data.history?.[0]
      showToast(last.win > 0 ? 'success' : 'error', `${last.warPlayerCard} vs ${last.warDealerCard} — ${RESULT_TEXT[last.result]}`)
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'War failed')
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
      setHistory(res.data.history)
      showToast('info', 'Surrendered — half your stake is back')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Surrender failed')
    } finally {
      setBusy(false)
    }
  }

  // last finished bet for the table display
  const last = !active ? history[0] : null

  return (
    <div className="cw-root">
      <header className="cw-header">
        <div className="cw-title"><Icon name="crown" size={22} strokeWidth={2.2} /><span>Casino War</span></div>
        <div className="cw-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="cw-main">
        <section className="cw-table">
          <div className="cw-hand">
            <span className="cw-label">YOU</span>
            <CardFace card={active?.playerCard ?? last?.playerCard} back={!(active || last)} />
          </div>
          <div className="cw-vs">{active ? 'TIE!' : 'VS'}</div>
          <div className="cw-hand">
            <span className="cw-label">DEALER</span>
            <CardFace card={active?.dealerCard ?? last?.dealerCard} back={!(active || last)} />
          </div>
        </section>

        {active ? (
          <>
            <div className="cw-tie-note">
              High-card tie! Raise <strong>{money(active.amount)}</strong> to go to war —
              win pays 1:1 on the ante, the war stake pushes — or surrender and keep half.
            </div>
            <div className="cw-war-actions">
              <button type="button" className="cw-go-war" onClick={war} disabled={busy}>
                <Icon name="zap" size={16} strokeWidth={2.4} /> GO TO WAR
              </button>
              <button type="button" className="cw-surrender" onClick={surrender} disabled={busy}>
                SURRENDER (½)
              </button>
            </div>
          </>
        ) : (
          <section className="cw-controls">
            <label className="cw-stake">
              <span>Stake</span>
              <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
            </label>
            <div className="cw-quick">
              {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
                <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
              ))}
            </div>
            <button type="button" className="cw-bet" onClick={bet} disabled={busy}>
              <Icon name="play" size={16} strokeWidth={2.5} /> {busy ? 'Dealing…' : 'BATTLE'}
            </button>
          </section>
        )}

        {last && (
          <div className={`cw-banner ${last.win > 0 && last.result !== 'surrender' ? 'is-win' : last.result !== 'dealerWins' && last.result !== 'warLoss' ? 'is-push' : 'is-loss'}`}>
            {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${last.result === 'surrender' ? money(last.win) : '+' + money(last.win)}` : ''}
          </div>
        )}

        <details className="cw-rules">
          <summary>How to play</summary>
          <ul>
            <li>One card each — <strong>higher card wins 1:1</strong></li>
            <li><strong>Tie?</strong> Go to war: match your stake to battle again</li>
            <li>Win the war → ante pays 1:1, war stake pushes</li>
            <li>Or surrender and get <strong>half</strong> the stake back</li>
            <li>Ace is high</li>
          </ul>
        </details>

        <div className="cw-history">
          <h3>Recent battles</h3>
          {history.length ? (
            <div className="cw-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="cw-hist-item">
                  <span className="cw-hist-cards">{b.playerCard} vs {b.dealerCard}{b.result === 'warWin' || b.result === 'warLoss' ? ` ⚔ ${b.warPlayerCard}/${b.warDealerCard}` : ''}</span>
                  <span>{money(b.staked)}</span>
                  <span className={b.result === 'playerWins' || b.result === 'warWin' ? 'win' : b.result === 'surrender' ? 'push' : 'lose'}>
                    {b.result === 'surrender' ? `+${money(b.win)}` : b.win > 0 ? `+${money(b.win)}` : 'Lost'}
                  </span>
                  <span className="cw-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="cw-empty">No battles yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`cw-toast cw-toast-${toast.kind}`} role="status">
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
        You need at least <strong>{money(minPlay)}</strong> in your wallet to play.
        Your balance is <strong>{money(balance)}</strong>.
      </Popup>
    </div>
  )
}
