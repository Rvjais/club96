import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import BottomNav from '../../components/BottomNav'
import Popup from '../../components/Popup'
import { useSiteConfig } from '../../lib/siteConfig'
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

const PIPS = {
  0: [],
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 7, 9],
}

function Die({ v, rolling }) {
  return (
    <span className={`bs-die ${rolling ? 'rolling' : ''}`}>
      <span className={`bs-pips bs-pips-${v}`}>
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

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() })
    setTimeout(() => setToast(t => t?.text === text ? null : t), 2600)
  }

  const fetchState = async () => {
    const res = await api.get('/games/big-small/state')
    setRules(res.data.rules)
    setHistory(res.data.history)
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
        const b = res.data.history?.[0]
        setShown(b?.dice ?? [1, 2, 3])
        setRolling(false)
        setHistory(res.data.history)
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
      showToast('error', e.response?.data?.error || 'Roll failed')
    }
  }

  const totalPayout = (key, p) => {
    if (key === 'total') {
      const ways = rules?.totalWays?.[p]
      return rules?.returns?.total?.[ways] ?? null
    }
    return rules?.returns?.[key]
  }

  const last = history[0]
  const totalOpts = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

  return (
    <div className="bs-root">
      <header className="bs-header">
        <div className="bs-title"><Icon name="dices" size={22} strokeWidth={2.2} /><span>Big / Small</span></div>
        <div className="bs-balance"><span>{money(balance)}</span></div>
      </header>

      <main className="bs-main">
        <section className="bs-stage">
          <div className="bs-dice">
            <Die v={shown[0]} rolling={rolling} />
            <Die v={shown[1]} rolling={rolling} />
            <Die v={shown[2]} rolling={rolling} />
          </div>
          {!rolling && last && !last.multiplier && (
            <div className={`bs-total ${last.win > 0 ? 'is-win' : 'is-loss'}`}>
              {last.dice.join(' + ')} = <strong>{last.total}</strong> · {last.win > 0 ? `+${money(last.win)}` : 'lost'}
            </div>
          )}
          {!rolling && last?.win > 0 && (
            <div className="bs-total is-win">Won {money(last.win)} at {last.multiplier}×</div>
          )}
        </section>

        <section className="bs-picks">
          <div className="bs-grid">
            {GROUPS.map(g => (
              <button key={g.key} type="button" className={betType === g.key ? 'active' : ''} onClick={() => chooseType(g.key)}>
                <span>{g.label}</span>
                <em>{g.key === 'total' ? '7×+' : `${g.payout}×`}</em>
              </button>
            ))}
          </div>

          {betType === 'double' || betType === 'triple' ? (
            <div className="bs-numbers">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button" className={pick === n ? 'active' : ''} onClick={() => setPick(n)}>{n}</button>
              ))}
            </div>
          ) : null}

          {betType === 'total' ? (
            <div className="bs-numbers totals">
              {totalOpts.map(n => (
                <button key={n} type="button" className={pick === n ? 'active' : ''} onClick={() => setPick(n)}>
                  {n}<i>{totalPayout('total', n) ?? ''}×</i>
                </button>
              ))}
            </div>
          ) : null}

          <label className="bs-stake">
            <span>Stake</span>
            <input type="number" min={rules?.minBet ?? 10} max={rules?.maxBet ?? 10000} value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
          </label>
          <div className="bs-quick">
            {[10, 50, 100, 500].filter(v => v >= (rules?.minBet ?? 10) && v <= (rules?.maxBet ?? 10000)).map(v => (
              <button key={v} type="button" onClick={() => setStake(String(v))}>₹{v}</button>
            ))}
          </div>
          <button type="button" className="bs-roll" onClick={roll} disabled={busy}>
            {rolling ? 'ROLLING…' : 'ROLL THE DICE'}
          </button>
        </section>

        <details className="bs-rules">
          <summary>How to play</summary>
          <ul>
            <li>Three dice, total 3–18</li>
            <li><strong>Small 4–10</strong> / <strong>Big 11–17</strong> pay 1.95× — but a <strong>triple</strong> kills both</li>
            <li><strong>Odd / even</strong> totals pay 1.9×</li>
            <li><strong>Doubles</strong> (exactly two) 11× · <strong>triples</strong> 31× / specific triple 181×</li>
            <li>Exact totals pay by rarity: common 7×, rare 61×</li>
          </ul>
        </details>

        <div className="bs-history">
          <h3>Recent rolls</h3>
          {history.length ? (
            <div className="bs-hist-list">
              {history.slice(0, 15).map(b => (
                <div key={b.id} className="bs-hist-item">
                  <span className="bs-hist-dice">{b.dice.join('·')}</span>
                  <span>{b.total}</span>
                  <span className="bs-hist-type">{b.betType}{b.pick != null ? ` ${b.pick}` : ''}</span>
                  <span>{money(b.amount)}</span>
                  <span className={b.win > 0 ? 'win' : 'lose'}>{b.win > 0 ? `+${money(b.win)}` : 'Lost'}</span>
                  <span className="bs-hist-time">{new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="bs-empty">No rolls yet</p>}
        </div>
      </main>

      <BottomNav onSoon={t => showToast('info', t)} />

      {toast && (
        <div key={toast.id} className={`bs-toast bs-toast-${toast.kind}`} role="status">
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
