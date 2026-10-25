import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './ThaiLottery.css'

export default function ThaiLottery() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [mode, setMode] = useState('2d')
  const [betType, setBetType] = useState('exact')
  const [pick, setPick] = useState('')
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [draw, setDraw] = useState(null)
  const [toast, setToast] = useState(null)
  const [lowBalance, setLowBalance] = useState(false)
  const minPlay = config?.minPlayBalance ?? 0

  const digits = mode === '2d' ? 2 : 3
  const minBet = rules?.minBet ?? 10
  const maxBet = rules?.maxBet ?? 10000

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/thai-lottery/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
  }

  useEffect(() => { fetchState() }, [])

  const switchMode = (m) => {
    setMode(m)
    setPick('')
    setBetType('exact')
  }

  const tap = (d) => {
    setPick(p => (p + d).slice(0, digits))
  }

  const bet = async () => {
    if (busy) return
    if (pick.length !== digits) return showToast('error', `Pick ${digits} digit${digits > 1 ? 's' : ''}`)
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    try {
      const res = await api.post('/games/thai-lottery/bet', { mode, betType, pick, amount })
      const b = res.data.history?.[0]
      setDraw({ draw: b.draw, pick: b.pick, win: b.win, status: b.status })
      setHistory(res.data.history)
      showToast(b.win > 0 ? 'success' : 'error', b.win > 0 ? `🎉 ${b.draw} — won ${money(b.win)}!` : `${b.draw} — no match`)
      setPick('')
      refreshWallet().catch(() => {})
    } catch (e) {
      showToast('error', e.response?.data?.error || 'Bet failed')
    } finally {
      setBusy(false)
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const payouts = rules?.payouts ?? {}
  const payNow = betType === 'exact'
    ? (mode === '2d' ? (payouts['2d-exact'] ?? 85) : (payouts['3d-exact'] ?? 800))
    : (mode === '2d' ? (payouts['2d-box'] ?? 40) : (payouts['3d-box-pair'] ?? 240))
  const hits = history.filter(b => b.win > 0).length

  return (
    <GameShell
      icon="ticket"
      title="Thai Lottery"
      tagline="2D & 3D draws"
      accent="#ffd43b"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="tl-dock">
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
                aria-label="Stake per bet"
              />
            </div>
            <button type="button" className="gs-chip" onClick={halfStake}>1/2</button>
            <button type="button" className="gs-chip" onClick={doubleStake}>2×</button>
            <button type="button" className="gs-chip" onClick={maxStake}>MAX</button>
          </div>
          <div className="gs-quick">
            {[10, 20, 50, 100].filter(v => v >= minBet && v <= maxBet).map(v => (
              <button key={v} type="button" className="gs-chip" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="gs-cta" onClick={bet} disabled={busy || pick.length !== digits}>
            <Icon name="play" size={17} strokeWidth={2.6} />
            {busy ? 'Drawing…' : 'Bet & draw'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage tl-stage">
        <div className="tl-halo" aria-hidden="true" />
        <div className="tl-stagecap"><Icon name="dices" size={13} strokeWidth={2.4} />{draw ? 'Latest draw' : 'Next draw'}</div>
        <div className="tl-balls" key={draw?.draw ?? 'idle'}>
          {draw
            ? draw.draw.split('').map((d, i) => (
              <span key={i} className="tl-ball" style={{ '--i': i }}>{d}</span>
            ))
            : Array.from({ length: digits }).map((_, i) => (
              <span key={i} className="tl-ball ghost" style={{ '--i': i }}>?</span>
            ))}
        </div>
        {draw ? (
          <div className="tl-readout">
            <span className="tl-minichip">PICK {draw.pick}</span>
            {draw.status === 'won'
              ? <span className="gs-pill gold">WON {money(draw.win)}</span>
              : <span className="gs-pill loss">NO MATCH</span>}
          </div>
        ) : (
          <p className="tl-idle-note">Pick {digits} digits, set a stake, then bet — the draw lands instantly</p>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > 0 ? 'gold' : ''}`}>{b.draw}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{draw?.draw ?? history[0]?.draw ?? '—'}</b>
          <span>Last draw</span>
        </div>
        <div className="gs-stat">
          <b>{hits}</b>
          <span>Hits</span>
        </div>
        <div className="gs-stat">
          <b>{payNow}×</b>
          <span>Pays now</span>
        </div>
      </div>

      <section className="gs-panel tl-pickpanel">
        <div className="gs-panel-title"><Icon name="hash" size={13} strokeWidth={2.4} />Your pick</div>
        <div className="tl-moderow">
          <button type="button" className={`gs-chip ${mode === '2d' ? 'is-on' : ''}`} onClick={() => switchMode('2d')}>2D</button>
          <button type="button" className={`gs-chip ${mode === '3d' ? 'is-on' : ''}`} onClick={() => switchMode('3d')}>3D</button>
          <span className="tl-modsep" aria-hidden="true" />
          <button type="button" className={`gs-chip ${betType === 'exact' ? 'is-on' : ''}`} onClick={() => setBetType('exact')}>Exact</button>
          <button type="button" className={`gs-chip ${betType === 'box' ? 'is-on' : ''}`} onClick={() => setBetType('box')}>Any order</button>
        </div>
        <div className="tl-slots">
          {Array.from({ length: digits }).map((_, i) => (
            <span key={`${i}-${pick[i] ?? '?'}`} className={`tl-slot ${i < pick.length ? 'filled' : ''}`}>{pick[i] ?? '?'}</span>
          ))}
        </div>
        <div className="tl-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map(k => (
            <button key={k} type="button" className={`tl-key ${k === 'C' || k === '←' ? 'is-fn' : ''}`} onClick={() => {
              if (k === 'C') setPick('')
              else if (k === '←') setPick(p => p.slice(0, -1))
              else tap(k)
            }}>{k}</button>
          ))}
        </div>
      </section>

      <section className="gs-panel tl-pays">
        <div className="gs-panel-title"><Icon name="receipt" size={13} strokeWidth={2.4} />Payout table</div>
        <div className="tl-payrow">
          {mode === '2d' ? (
            <>
              <span className="gs-pill">2D exact · {(payouts['2d-exact'] ?? 85)}×</span>
              <span className="gs-pill">2D any order · {(payouts['2d-box'] ?? 40)}×</span>
            </>
          ) : (
            <>
              <span className="gs-pill">3D exact · {(payouts['3d-exact'] ?? 800)}×</span>
              <span className="gs-pill">3D box (pair) · {(payouts['3d-box-pair'] ?? 240)}×</span>
              <span className="gs-pill">3D box (6-way) · {(payouts['3d-box-6way'] ?? 120)}×</span>
            </>
          )}
        </div>
      </section>

      <section className="gs-panel gs-hist">
        <div className="gs-panel-title"><Icon name="history" size={13} strokeWidth={2.4} />Recent bets</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className="tl-hist-pick">{b.pick}</span>
              <span className="tl-hist-draw">→ {b.draw}</span>
              <span className="tl-hist-stake">{money(b.amount)}</span>
              <span className={b.win > 0 ? 'win' : 'lose'}>
                {b.win > 0 ? `+${money(b.win)} (${b.multiplier}×)` : 'Lost'}
              </span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No bets yet — make your first pick</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Pick 2 or 3 digits (0–9), then stake</li>
          <li><strong>Exact</strong>: digits must match the draw in order</li>
          <li><strong>Any order (box)</strong>: match rearranged — needs non-repeating digits</li>
          <li>A fresh digit draw for every bet</li>
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
