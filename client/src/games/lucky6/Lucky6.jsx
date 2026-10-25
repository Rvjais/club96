import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
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

  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

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

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const drawns = new Set(last?.main ?? [])
  const bonus = last?.bonus
  const bestMatch = history.reduce((m, b) => (b.matches > m ? b.matches : m), 0)

  return (
    <GameShell
      icon="gem"
      title="Lucky 6/49"
      tagline="Pick 6 draw 6"
      accent="#51e07f"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="l6-dock">
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
          <button type="button" className="gs-cta" onClick={bet} disabled={busy || picks.length !== picksNeeded}>
            <Icon name="play" size={17} strokeWidth={2.6} />
            {busy ? 'Drawing…' : 'Draw balls'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage l6-stage" key={last?.id ?? 'idle'}>
        <div className="l6-halo" aria-hidden="true" />
        <div className="l6-stagecap">
          <Icon name="dices" size={13} strokeWidth={2.4} />
          {last ? 'Latest draw' : 'Machine ready'}
        </div>
        <div className="l6-balls">
          {last
            ? last.main.map((n, i) => (
              <span key={`m${n}`} className={`l6-ball ${picks.includes(n) ? 'match' : ''}`} style={{ '--i': i }}>{n}</span>
            ))
            : Array.from({ length: 6 }, (_, i) => (
              <span key={`g${i}`} className="l6-ball ghost" style={{ '--i': i }}>·</span>
            ))}
          {last
            ? <span key="b" className="l6-ball bonus" style={{ '--i': last.main.length }}>{bonus ?? '?'}</span>
            : <span key="gb" className="l6-ball ghost bonus" style={{ '--i': 6 }}>B</span>}
        </div>
        {last ? (
          <>
            <span className="l6-bonusnote"><Icon name="star" size={12} strokeWidth={2.4} />Gold ball = bonus</span>
            <div className={`gs-banner ${last.win > 0 ? 'win' : 'loss'}`}>
              {last.win > 0 ? `${last.matches} matched — won ${money(last.win)}` : `${last.matches} of ${picksNeeded} — no prize`}
            </div>
          </>
        ) : (
          <p className="l6-idle-note">Pick {picksNeeded} numbers, then draw — 6 main balls + 1 golden bonus</p>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > 0 ? 'win' : 'loss'}`}>{b.matches}/6</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>1–{pool}</b>
          <span>Number pool</span>
        </div>
        <div className="gs-stat">
          <b>{history.length ? `${bestMatch}/6` : '—'}</b>
          <span>Best match</span>
        </div>
        <div className="gs-stat">
          <b>{last?.win > 0 ? money(last.win) : '—'}</b>
          <span>Last win</span>
        </div>
      </div>

      <section className="gs-panel l6-boardpanel">
        <div className="gs-panel-title"><Icon name="grid" size={13} strokeWidth={2.4} />Bet board · pick {picksNeeded} of {pool}</div>
        <div className="l6-pickedrow">
          <span className="l6-count">Picks ({picks.length}/{picksNeeded})</span>
          {picks.map(n => <em key={n} className="l6-pickedchip">{n}</em>)}
        </div>
        <div className="l6-grid">
          {Array.from({ length: pool }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              className={`l6-tile ${picks.includes(n) ? 'is-on' : ''} ${last && picks.includes(n) && drawns.has(n) ? 'is-hit' : ''} ${last && n === bonus ? 'is-bn' : ''}`}
              onClick={() => toggle(n)}
              aria-pressed={picks.includes(n)}
            >{n}</button>
          ))}
        </div>
        <div className="l6-actions">
          <button type="button" className="gs-btn-ghost" onClick={quickPick}>
            <Icon name="zap" size={15} strokeWidth={2.4} /> Quick pick
          </button>
          <button type="button" className="gs-btn-ghost" onClick={() => setPicks([])}>Clear</button>
        </div>
      </section>

      <section className="gs-panel l6-pays">
        <div className="gs-panel-title"><Icon name="receipt" size={13} strokeWidth={2.4} />Payout table</div>
        <div className="l6-payrow">
          {Object.entries(rules?.payouts ?? { 3: 8, 4: 100, 5: 1500, '5+bonus': 3000, 6: 50000, '2+bonus': 4 }).map(([k, v]) => (
            <span key={k} className="gs-pill">
              {k.endsWith('bonus') ? `${k.replace('+bonus', '')} + bonus` : `${k} matches`} · <b>{v}×</b>
            </span>
          ))}
        </div>
      </section>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title"><Icon name="history" size={13} strokeWidth={2.4} />Recent draws</div>
        {history.length ? (
          history.slice(0, 12).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className={b.win > 0 ? 'win' : 'lose'}>{b.matches}/6</span>
              <span className="l6-hist-balls">{b.drawn.join(' ')}</span>
              <span className="l6-hist-stake">{money(b.amount)}</span>
              <span className={b.win > 0 ? 'win' : 'lose'}>
                {b.win > 0 ? `+${money(b.win)}` : 'No win'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No draws yet — pick your six</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Pick <strong>{picksNeeded} numbers</strong> from 1–{pool}</li>
          <li>6 main balls + 1 bonus ball are drawn</li>
          <li>Match 3+ to win — bigger matches pay much more</li>
          <li>Matching the bonus ball boosts small prizes</li>
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
