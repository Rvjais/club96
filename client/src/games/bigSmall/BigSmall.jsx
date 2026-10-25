import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
import GameShell from '../lib/GameShell'
import './BigSmall.css'

// bet type groups: { key, label, pick? }
const GROUPS = [
  { key: 'small', label: 'Small 4–10', payout: 1.95 },
  { key: 'big', label: 'Big 11–17', payout: 1.95 },
  { key: 'odd', label: 'Odd total', payout: 1.9 },
  { key: 'even', label: 'Even total', payout: 1.9 },
  { key: 'anyTriple', label: 'Any triple', payout: 31 },
  { key: 'double', label: 'Specific double', pick: true, payout: 11 },
  { key: 'triple', label: 'Specific triple', pick: true, payout: 181 },
  { key: 'total', label: 'Exact total', pick: true },
]

const SIDE_BETS = GROUPS.filter(g => g.key !== 'small' && g.key !== 'big')
const sidePay = (g) => (g.key === 'total' ? '7×+' : `${g.payout}×`)

// pip cells 1–9 laid out row-major (1 2 3 / 4 5 6 / 7 8 9)
const PIPS = {
  0: [],
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

function Die({ v, rolling }) {
  return (
    <span className={`bs-die ${rolling ? 'rolling' : ''}`}>
      <span className="bs-pips">
        {Array.from({ length: 9 }, (_, i) => i + 1).map(cell => (
          <i key={cell} className={PIPS[v]?.includes(cell) ? 'on' : 'off'} />
        ))}
      </span>
    </span>
  )
}

export default function BigSmall() {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const config = useSiteConfig()
  const [rules, setRules] = useState(null)
  const [history, setHistory] = useState([])
  const [betType, setBetType] = useState('small')
  const [pick, setPick] = useState(null)
  const [stake, setStake] = useState('10')
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [shown, setShown] = useState([1, 2, 3])
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
    const res = await api.get('/games/big-small/state')
    setRules(res.rules)
    setHistory(res.history)
  }

  useEffect(() => { fetchState() }, [])

  const group = GROUPS.find(g => g.key === betType)

  const chooseType = (key) => {
    setBetType(key)
    setPick(null)
  }

  const roll = async () => {
    if (busy) return
    if (group?.pick && pick == null) return showToast('error', 'Pick a value first')
    const amount = Number(stake)
    if (!amount || amount <= 0) return showToast('error', 'Enter a valid amount')
    if (balance < minPlay) return setLowBalance(true)
    setBusy(true)
    setRolling(true)
    const tumbler = setInterval(() => setShown([Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]), 90)
    try {
      const res = await api.post('/games/big-small/roll', { betType, pick, amount })
      setTimeout(() => {
        clearInterval(tumbler)
        const b = res.history?.[0]
        setShown(b?.dice ?? [1, 2, 3])
        setRolling(false)
        setHistory(res.history)
        if (b) {
          const label = group?.label ?? betType
          showToast(b.win > 0 ? 'success' : 'error',
            b.win > 0 ? `${b.dice.join(' · ')} = ${b.total} — ${label} won ${money(b.win)}!` : `${b.dice.join(' · ')} = ${b.total} — ${label} lost`)
        }
        refreshWallet().catch(() => {})
      }, 900)
    } catch (e) {
      clearInterval(tumbler)
      setRolling(false)
      setBusy(false)
      showToast('error', e.message || 'Roll failed')
    }
  }

  const halfStake = () => setStake(String(Math.max(minBet, Math.floor((Number(stake) || 0) / 2) || minBet)))
  const doubleStake = () => setStake(String(Math.min(maxBet, Math.max(minBet, Math.floor((Number(stake) || 0) * 2)))))
  const maxStake = () => setStake(String(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0)))))

  const totalPayout = (key, p) => {
    if (key === 'total') {
      const ways = rules?.totalWays?.[p]
      return rules?.returns?.total?.[ways] ?? null
    }
    return rules?.returns?.[key]
  }

  const last = history[0]
  const totalOpts = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

  // purely visual: BIG / SMALL verdict badge for the last roll
  const lastTriple = last ? last.dice[0] === last.dice[1] && last.dice[1] === last.dice[2] : false
  const verdict = !last ? '—' : lastTriple ? 'TRIPLE' : last.total <= 10 ? 'SMALL' : 'BIG'

  let streak = 0
  for (const b of history) { if (b.win > 0) streak++; else break }

  return (
    <GameShell
      icon="dices"
      title="Big / Small"
      tagline="Three dice sic bo"
      accent="#4dabf7"
      busy={busy}
      toast={toast}
      onRefresh={fetchState}
      footer={(
        <div className="bs-dock">
          <div className="bs-call">
            <button type="button" className={`bs-call-btn small ${betType === 'small' ? 'is-on' : ''}`} onClick={() => chooseType('small')}>
              <span className="bs-call-face s">S</span>
              <span className="bs-call-txt">SMALL<em>4–10 · {sidePay(GROUPS[0])}</em></span>
            </button>
            <button type="button" className={`bs-call-btn big ${betType === 'big' ? 'is-on' : ''}`} onClick={() => chooseType('big')}>
              <span className="bs-call-face b">B</span>
              <span className="bs-call-txt">BIG<em>11–17 · {sidePay(GROUPS[1])}</em></span>
            </button>
          </div>

          <div className="bs-mores">
            {SIDE_BETS.map(g => (
              <button key={g.key} type="button" className={`gs-chip ${betType === g.key ? 'is-on' : ''}`} onClick={() => chooseType(g.key)}>
                {g.label}<em>{sidePay(g)}</em>
              </button>
            ))}
          </div>

          {(betType === 'double' || betType === 'triple') && (
            <div className="bs-pickrow faces">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button" className={`bs-pick ${pick === n ? 'is-on' : ''}`} onClick={() => setPick(n)}>{n}</button>
              ))}
            </div>
          )}

          {betType === 'total' && (
            <div className="bs-pickrow totals">
              {totalOpts.map(n => (
                <button key={n} type="button" className={`bs-pick ${pick === n ? 'is-on' : ''}`} onClick={() => setPick(n)}>
                  {n}<i>{totalPayout('total', n) ?? ''}×</i>
                </button>
              ))}
            </div>
          )}

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

          <button type="button" className="gs-cta" onClick={roll} disabled={busy}>
            <Icon name={rolling ? 'refresh' : 'play'} size={17} strokeWidth={2.6} />
            {rolling ? 'ROLLING…' : 'ROLL THE DICE'}
          </button>
        </div>
      )}
    >
      <section className="gs-stage bs-stage">
        <div className="bs-spotlight" aria-hidden="true" />
        <div className="bs-dice">
          <Die v={shown[0]} rolling={rolling} />
          <Die v={shown[1]} rolling={rolling} />
          <Die v={shown[2]} rolling={rolling} />
        </div>
        {!rolling && last && (
          <span className={`bs-verdict ${lastTriple ? 'is-triple' : last.win > 0 ? 'is-win' : 'is-loss'}`}>
            <i className="bs-verdict-tick" aria-hidden="true" />
            {verdict} · {last.total}
          </span>
        )}
        {!rolling && last && !last.multiplier && (
          <div className={`bs-total ${last.win > 0 ? 'is-win' : 'is-loss'}`}>
            {last.dice.join(' + ')} = <strong>{last.total}</strong> · {last.win > 0 ? `+${money(last.win)}` : 'lost'}
          </div>
        )}
        {!rolling && last?.win > 0 && (
          <div className="bs-total is-win">Won {money(last.win)} at {last.multiplier}×</div>
        )}
      </section>

      <div className="gs-strip">
        {history.slice(0, 14).map(b => (
          <span key={b.id} className={`gs-pill ${b.win > 0 ? 'win' : 'loss'}`}>{b.total}</span>
        ))}
        {!history.length && <span className="gs-pill">—</span>}
      </div>

      <div className="gs-stats">
        <div className="gs-stat">
          <b>{last?.total ?? '—'}</b>
          <span>Last total</span>
        </div>
        <div className="gs-stat">
          <b>{streak > 0 ? `${streak}×` : '—'}</b>
          <span>Win streak</span>
        </div>
        <div className="gs-stat">
          <b>{group ? sidePay(group) : '1.95×'}</b>
          <span>Your bet pays</span>
        </div>
      </div>

      <section className="gs-panel gs-hist bs-hist">
        <div className="gs-panel-title">Recent rolls</div>
        {history.length ? (
          history.slice(0, 15).map(b => (
            <div key={b.id} className="gs-hist-row">
              <span className="bs-hist-mini">
                {b.dice.map((d, i) => <i key={i}>{d}</i>)}
              </span>
              <b className="bs-hist-total">{b.total}</b>
              <span className="bs-hist-type">{b.betType}{b.pick != null ? ` ${b.pick}` : ''}</span>
              <span className="bs-hist-stake">{money(b.amount)}</span>
              <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
              <span className="gs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : <p className="gs-hist-empty">No rolls yet — shake them bones</p>}
      </section>

      <details className="gs-rules">
        <summary>How to play</summary>
        <ul>
          <li>Three dice, total 3–18</li>
          <li><strong>Small 4–10</strong> / <strong>Big 11–17</strong> pay 1.95× — but a <strong>triple</strong> kills both</li>
          <li><strong>Odd / even</strong> totals pay 1.9×</li>
          <li><strong>Doubles</strong> (exactly two) 11× · <strong>triples</strong> 31× / specific triple 181×</li>
          <li>Exact totals pay by rarity: common 7×, rare 61×</li>
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
