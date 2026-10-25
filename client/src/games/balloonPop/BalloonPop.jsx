import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './BalloonPop.css'

const COLORS = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#38bdf8', '#f472b6', '#a78bfa', '#f87171', '#34d399']
const LADDER_TINT = { 1.2: '#34d399', 1.5: '#38bdf8', 2: '#a78bfa', 3: '#fbbf24', 5: '#5ad1ff', 10: '#f7c948' }

export default function BalloonPop() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null) // last outcome
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
    const res = await api.get('/games/balloon-pop/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const count = rules?.count ?? 9

  const pick = async (i) => {
    if (busy) return
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/balloon-pop/pick', { pick: i, amount })
      const b = res.data.history?.[0]
      setLast({ ...b, pick: i })
      setHistory(res.data.history)
      showToast(b.outcome === 'prize' ? 'success' : 'error',
        b.outcome === 'prize' ? `${b.symbol} ${b.multiplier}× — won ${money(b.win)}!` : '💥 POP! It burst — lost')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Pick failed')
    } finally {
      setBusy(false)
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const prizes = (rules?.outcomes ?? []).filter(o => o.kind === 'prize')
  const topPrize = prizes.length ? Math.max(...prizes.map(o => o.mult)) : null

  return (
    <GameShell
      icon="zap"
      title="Balloon Pop"
      tagline="Prize or pop"
      accent="#ff5d8f"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="bp-dock">
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
          <button type="button" className="gs-btn-ghost bp-hint" disabled>
            <Icon name={busy ? 'zap' : 'chevronUp'} size={15} strokeWidth={2.4} />
            {busy ? 'Popping…' : 'Tap a balloon to pop'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage bp-stage">
        <div className="bp-haze" aria-hidden="true" />
        <div className="bp-grid">
          {Array.from({ length: count }).map((_, i) => {
            const shown = last?.pick === i
            return (
              <button
                key={i}
                type="button"
                className={`bp-balloon ${shown ? (last.outcome === 'prize' ? 'burst-prize' : 'burst-pop') : ''}`}
                style={{ '--c': COLORS[i % COLORS.length], '--d': `${(i % 9) * 220}ms` }}
                onClick={() => pick(i)}
                disabled={busy}
                aria-label={`Balloon ${i + 1}`}
              >
                {shown
                  ? (
                    <span className="bp-burst">
                      <b>{last.outcome === 'pop' ? '💥' : last.symbol}</b>
                      {last.outcome === 'prize' && <i className="bp-burst-mult">{last.multiplier}×</i>}
                    </span>
                    )
                  : (
                    <span className="bp-bubble" />
                    )}
              </button>
            )
          })}
        </div>
        {last && (
          <div className={`gs-banner ${last.outcome === 'prize' ? 'win' : 'loss'}`}>
            {last.outcome === 'prize'
              ? `${last.symbol} ${last.multiplier}× — +${money(last.win)}`
              : '💥 Balloon popped — stake lost'}
          </div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > 0 ? 'gold' : 'loss'}`}>{b.symbol}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{last ? last.symbol : '—'}</b>
          <span>Last pick</span>
        </div>
        <div className="gs-stat">
          <b>{topPrize ? `${topPrize}×` : '—'}</b>
          <span>Might pay</span>
        </div>
        <div className="gs-stat">
          <b>{history.length}</b>
          <span>Picks</span>
        </div>
      </div>

      <section className="gs-panel">
        <div className="gs-panel-title">Prize ladder</div>
        <div className="bp-ladder">
          {prizes.map(o => (
            <span key={o.symbol} className="bp-lchip" style={{ '--t': LADDER_TINT[o.mult] || '#9aa4ba' }}>
              {o.symbol} <b>{o.mult}×</b>
            </span>
          ))}
        </div>
      </section>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title">Recent picks</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={`bp-hist-badge ${b.win > 0 ? 'w' : 'l'}`}>{b.symbol}</span>
              <span className="bp-hist-slot">#{(b.pick ?? 0) + 1}</span>
              <span className="bp-hist-stake">{money(b.amount)}</span>
              <span className={b.win > 0 ? 'win' : 'lose'}>
                {b.win > 0 ? `+${money(b.win)} (${b.multiplier}×)` : 'Popped'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No picks yet — pop your first</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Pick any balloon — every pick is a fresh draw</li>
          <li>Balloon holds a prize: <strong>1.2× to 10×</strong> the stake</li>
          <li>About half the time it <strong>pops</strong> and the stake is lost</li>
          <li>Only one balloon bursts per pick — try your luck</li>
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
