import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import './Lucky6.css'

export default function Lucky6() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [picks, setPicks] = useState([])
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/lucky-6/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const pool = rules?.pool ?? 49
  const picksNeeded = rules?.picks ?? 6

  const toggle = (n) => {
    setPicks(p => p.includes(n) ? p.filter(x => x !== n) : p.length < picksNeeded ? [...p, n] : p)
  }

  const quickPick = () => {
    const chosen = new Set()
    while (chosen.size < picksNeeded) chosen.add(1 + Math.floor(Math.random() * pool))
    setPicks([...chosen])
  }

  const bet = async () => {
    if (busy) return
    if (picks.length !== picksNeeded) return showToast('error', `Pick ${picksNeeded} numbers`)
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/lucky-6/bet', { picks, amount })
      const b = res.data.history?.[0]
      setLast(b)
      setHistory(res.data.history)
      showToast(b.win > 0 ? 'success' : 'error',
        b.win > 0 ? `🎉 ${b.matches} matched — won ${money(b.win)}!` : `${b.matches} of 6 — no prize`)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Bet failed')
    } finally {
      setBusy(false)
    }
  }

  const drawns = new Set(last?.main ?? [])
  const bonus = last?.bonus

  return (
    <div className="l6-root">
      <header className="l6-header">
        <div className="l6-title"><Icon name="grid" size={22} strokeWidth={2.2} /><span>Lucky 6/49</span></div>
        <div className="l6-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="l6-main">
        <section className="l6-board">
          <div className="l6-selected">
            <span>Picks ({picks.length}/{picksNeeded})</span>
            <div className="l6-picked">{picks.map(n => <em key={n}>{n}</em>)}</div>
          </div>
          <div className="l6-grid">
            {Array.from({ length: pool }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" className={picks.includes(n) ? 'picked' : ''} onClick={() => toggle(n)}>{n}</button>
            ))}
          </div>
          <div className="l6-elected">
            <button type="button" className="l6-quick" onClick={quickPick}>
              <Icon name="zap" size={14} strokeWidth={2.4} /> Quick pick
            </button>
            <button type="button" className="l6-clear" onClick={() => setPicks([])}>Clear</button>
          </div>
        </section>

        {last && (
          <div className="l6-draw">
            <span>DRAWN:</span>
            {last.main.map(n => (
              <em key={n} className={last.matches > 0 ? undefined : undefined}>{n}</em>
            ))}
            <em className="l6-bonus">{bonus}</em>
            <small>bonus</small>
            {last.win > 0 && <strong className="l6-won">+{money(last.win)}</strong>}
          </div>
        )}

        <section className="l6-controls">
          <label className="l6-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <button type="button" className="l6-bet" onClick={bet} disabled={busy || picks.length !== picksNeeded}>
            <Icon name="play" size={16} strokeWidth={2.5} /> {busy ? 'Drawing…' : 'DRAW BALLS'}
          </button>
        </section>

        <div className="l6-pay">
          {Object.entries(rules?.payouts ?? { 3: 8, 4: 100, 5: 1500, '5+bonus': 3000, 6: 50000, '2+bonus': 4 }).map(([k, v]) => (
            <span key={k}>{k.endsWith('bonus') ? `${k.replace('+bonus', '')} + bonus` : `${k} matches`} <strong>{v}×</strong></span>
          ))}
        </div>

        <details className="l6-rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick <strong>{picksNeeded} numbers</strong> from 1–{pool}</li>
            <li>6 main balls + 1 bonus ball are drawn</li>
            <li>Match 3+ to win — bigger matches pay much more</li>
            <li>Matching the bonus ball boosts small prizes</li>
          </ul>
        </details>

        <div className="l6-history">
          <h3>Recent draws</h3>
          {history.length ? (
            <div className="l6-hist-list">
              {history.slice(0, 12).map(b => (
                <div key={b.id} className="l6-hist-item">
                  <span className="l6-hist-picks">{b.matches}/6</span>
                  <span className="l6-hist-balls">{b.drawn.join(' ')}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>
                    {b.win > 0 ? `+${money(b.win)}` : 'No win'}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="l6-empty">No draws yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`l6-toast l6-toast-${toast.kind}`} role="status">
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
