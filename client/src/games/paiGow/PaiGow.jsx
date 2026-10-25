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
import './PaiGow.css'

const RESULT_TEXT = {
  playerWins: 'You win both — 1:1 minus 5% commission',
  dealerWins: 'Dealer wins',
  push: 'Push — stake back',
}

const MARK = { won: 'WIN', lost: 'LOSE', tied: 'TIE' }

export default function PaiGow() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2800)
  }

  const fetchState = async () => {
    const res = await api.get('/games/pai-gow/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const deal = async () => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/pai-gow/deal', { amount })
      const b = res.data.history?.[0]
      setLast(b)
      setHistory(res.data.history)
      showToast(b.result === 'playerWins' ? 'success' : b.result === 'push' ? 'info' : 'error', RESULT_TEXT[b.result])
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Deal failed')
    } finally {
      setBusy(false)
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  // purely presentational: colour each row from the overall result
  const youCls = last ? (last.result === 'playerWins' ? 'won' : last.result === 'push' ? 'tied' : 'lost') : ''
  const dlrCls = last ? (last.result === 'playerWins' ? 'lost' : last.result === 'push' ? 'tied' : 'won') : ''
  const bestWin = history.reduce((m, b) => (b.result === 'playerWins' && b.win - b.amount > m ? b.win - b.amount : m), 0)
  const totalStaked = history.reduce((m, b) => m + b.amount, 0)

  return (
    <GameShell
      icon="layers"
      title="Pai Gow Poker"
      tagline="Win both hands"
      accent="#a78bfa"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      wide
      footer={(
        <div className="pg-dock">
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
            {busy ? 'Dealing…' : 'Deal & split'}
          </button>
        </div>
      )}
    >
      <section className={`gs-stage pg-stage ${busy ? 'is-dealing' : ''}`}>
        <div className="pg-rail" aria-hidden="true" />
        {last ? (
          <div className="pg-felt">
            <div className="pg-hand">
              <div className="pg-sidehead">
                <span className="pg-sidechip you"><Icon name="user" size={11} strokeWidth={2.4} />You</span>
              </div>
              <div className="pg-rows">
                <div className={`pg-row ${youCls}`}>
                  <div className="pg-rowlabel">
                    <b>High</b><i>5 cards</i>
                    <em className={`pg-mark ${youCls}`}>{MARK[youCls]}</em>
                  </div>
                  <div className="pg-cards">
                    {last.playerHigh.map((c, i) => (
                      <div key={i} className="pg-card" style={{ '--i': i }}><CardFace card={c} small /></div>
                    ))}
                  </div>
                </div>
                <div className={`pg-row ${youCls}`}>
                  <div className="pg-rowlabel low">
                    <b>Low</b><i>2 cards</i>
                    <em className={`pg-mark ${youCls}`}>{MARK[youCls]}</em>
                  </div>
                  <div className="pg-cards">
                    {last.playerLow.map((c, i) => (
                      <div key={i} className="pg-card" style={{ '--i': i + 5 }}><CardFace card={c} small /></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pg-vs">VS</div>

            <div className="pg-hand">
              <div className="pg-sidehead">
                <span className="pg-sidechip dealer"><Icon name="spade" size={11} strokeWidth={2.4} />Dealer</span>
              </div>
              <div className="pg-rows">
                <div className={`pg-row ${dlrCls}`}>
                  <div className="pg-rowlabel">
                    <b>High</b><i>5 cards</i>
                    <em className={`pg-mark ${dlrCls}`}>{MARK[dlrCls]}</em>
                  </div>
                  <div className="pg-cards">
                    {last.dealerHigh.map((c, i) => (
                      <div key={i} className="pg-card" style={{ '--i': i }}><CardFace card={c} small /></div>
                    ))}
                  </div>
                </div>
                <div className={`pg-row ${dlrCls}`}>
                  <div className="pg-rowlabel low">
                    <b>Low</b><i>2 cards</i>
                    <em className={`pg-mark ${dlrCls}`}>{MARK[dlrCls]}</em>
                  </div>
                  <div className="pg-cards">
                    {last.dealerLow.map((c, i) => (
                      <div key={i} className="pg-card" style={{ '--i': i + 5 }}><CardFace card={c} small /></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={`gs-banner ${last.result === 'playerWins' ? 'win' : last.result === 'push' ? 'push' : 'loss'}`}>
              {RESULT_TEXT[last.result]}{last.win > 0 ? ` — ${money(last.win)}` : ''}
            </div>
          </div>
        ) : (
          <div className="pg-idle">
            <div className="pg-idle-hand">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={`h${i}`} className="pg-card" style={{ '--i': i }}><CardFace back small /></div>
              ))}
            </div>
            <div className="pg-idle-hand low">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={`l${i}`} className="pg-card" style={{ '--i': i + 5 }}><CardFace back small /></div>
              ))}
            </div>
            <p className="pg-idle-cap">Seven cards · auto split 5 + 2</p>
            <p className="pg-idle-note">Beat the dealer on <b>both</b> hands to win</p>
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.result === 'playerWins' ? 'win' : b.result === 'push' ? 'gold' : 'loss'}`}>
            {b.result === 'playerWins' ? 'W' : b.result === 'push' ? 'P' : 'L'}
          </span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{history.length}</b>
          <span>Hands</span>
        </div>
        <div className="gs-stat">
          <b>{money(bestWin)}</b>
          <span>Best win</span>
        </div>
        <div className="gs-stat">
          <b>{money(totalStaked)}</b>
          <span>Total staked</span>
        </div>
      </div>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title"><Icon name="history" size={13} strokeWidth={2.4} />Recent hands</div>
        {history.length ? (
          history.slice(0, 15).map(b => {
            const cls = b.result === 'playerWins' ? 'win' : b.result === 'push' ? 'pg-push' : 'lose'
            return (
              <div key={b.id} className="gs-hist-row">
                <span className={`pg-dot ${cls}`} />
                <span className={cls}>{b.result === 'playerWins' ? 'WON' : b.result === 'push' ? 'PUSH' : 'LOST'}</span>
                <span className="pg-staketxt">{money(b.amount)}</span>
                <span className={cls}>
                  {b.result === 'playerWins' ? `+${money(b.win - b.amount)}` : b.result === 'push' ? money(b.win) : '−' + money(b.amount)}
                </span>
                <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )
          })
        ) : <p className="gs-hist-empty">No hands yet — deal your first</p>}
      </section>

      <details className="gs-rules" open={!last}>
        <summary>How to play</summary>
        <ul>
          <li>You get <strong>7 cards</strong>, dealer gets 7</li>
          <li>Both hands are split automatically into a <strong>5-card high</strong> and a <strong>2-card low</strong></li>
          <li><strong>Win both</strong> hands → paid 1:1 minus 5% commission</li>
          <li>Split 1–1 → <strong>push</strong>; otherwise you lose</li>
          <li>Two-card hand: any <strong>pair</strong> beats any two singles</li>
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
