import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import './BalloonPop.css'

const COLORS = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#38bdf8', '#f472b6', '#a78bfa', '#f87171', '#34d399']

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

  return (
    <div className="bp-root">
      <header className="bp-header">
        <div className="bp-title"><Icon name="zap" size={22} strokeWidth={2.2} /><span>Balloon Pop</span></div>
        <div className="bp-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="bp-main">
        <section className="bp-table">
          <div className="bp-grid">
            {Array.from({ length: count }).map((_, i) => {
              const shown = last?.pick === i
              return (
                <button
                  key={i}
                  type="button"
                  className={`bp-balloon ${shown ? (last.outcome === 'prize' ? 'burst-prize' : 'burst-pop') : ''}`}
                  style={{ '--c': COLORS[i % COLORS.length] }}
                  onClick={() => pick(i)}
                  disabled={busy}
                  aria-label={`Balloon ${i + 1}`}
                >
                  {shown
                    ? <span className="bp-burst">{last.outcome === 'pop' ? '💥' : last.symbol}</span>
                    : <span className="bp-bubble" />}
                </button>
              )
            })}
          </div>
          {last && (
            <div className={`bp-banner ${last.outcome === 'prize' ? 'is-win' : 'is-loss'}`}>
              {last.outcome === 'prize'
                ? `${last.symbol} ${last.multiplier}× — +${money(last.win)}`
                : '💥 Balloon popped — stake lost'}
            </div>
          )}
        </section>

        <section className="bp-controls">
          <label className="bp-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="bp-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <div className="bp-odds">
            {(rules?.outcomes ?? []).filter(o => o.kind === 'prize').map(o => (
              <span key={o.symbol} className="bp-odd">{o.symbol} {o.mult}×</span>
            ))}
          </div>
        </section>

        <details className="bp-rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick any balloon — every pick is a fresh draw</li>
            <li>Balloon holds a prize: <strong>1.2× to 10×</strong> the stake</li>
            <li>About half the time it <strong>pops</strong> and the stake is lost</li>
            <li>Only one balloon bursts per pick — try your luck</li>
          </ul>
        </details>

        <div className="bp-history">
          <h3>Recent picks</h3>
          {history.length ? (
            <div className="bp-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="bp-hist-item">
                  <span>{b.symbol}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)} (${b.multiplier}×)` : 'Popped'}
                  </span>
                  <span className="bp-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="bp-empty">No picks yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`bp-toast bp-toast-${toast.kind}`} role="status">
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
