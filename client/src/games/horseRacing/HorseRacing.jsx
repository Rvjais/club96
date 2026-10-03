import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import './HorseRacing.css'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const money = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const CHIPS = [50, 100, 250, 500]

export default function HorseRacing() {
  const navigate = useNavigate()
  const { balance, setBalance } = useAuth()
  const [rules, setRules] = useState(null)
  const [horses, setHorses] = useState([])
  const [horseId, setHorseId] = useState(null)
  const [betType, setBetType] = useState('win')
  const [amount, setAmount] = useState(50)
  const [race, setRace] = useState(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api.get('/games/horse-racing/state').then((data) => {
      if (!alive) return
      setRules(data.rules)
      setHorses(data.horses)
      setHorseId(data.horses[0]?.id ?? null)
      setAmount(data.rules.minBet)
    }).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  const picked = horses.find((horse) => horse.id === horseId)
  const estimatedReturn = useMemo(() => {
    if (!picked || !rules) return 0
    const odds = betType === 'win' ? picked.winOdds : picked.placeOdds
    return Math.min(Number(amount) * odds * (1 - rules.houseEdge / 100), rules.maxWin)
  }, [picked, rules, amount, betType])

  const placeBet = async () => {
    if (busy || !horseId || !rules?.enabled) return
    setBusy(true); setError(''); setRace(null); setRunning(true)
    const started = Date.now()
    try {
      const data = await api.post('/games/horse-racing/race', { horseId, betType, amount: Number(amount) })
      await wait(Math.max(0, 4200 - (Date.now() - started)))
      setBalance(data.balance)
      setRace(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false); setBusy(false)
    }
  }

  return <main className="hr-page">
    <header className="hr-header">
      <button className="hr-back" onClick={() => navigate('/game')} aria-label="Back to lobby"><Icon name="chevronLeft" size={20}/></button>
      <div className="hr-brand"><span className="hr-brand-mark">♞</span><div><strong>ROYAL TURF DERBY</strong><small>VIRTUAL RACING CLUB</small></div></div>
      <div className="hr-balance"><small>WALLET</small><strong>₹{money(balance)}</strong></div>
    </header>

    <div className="hr-content">
      <section className="hr-race-card">
        <div className="hr-race-heading"><div><span className="hr-eyebrow"><i/> {running ? 'RACE IN PROGRESS' : 'NEXT RACE · 1200M'}</span><h1>Royal Sprint</h1><p>Six thoroughbreds. One finish line.</p></div><div className="hr-condition"><span>☀</span><div><b>GOOD</b><small>TURF CONDITION</small></div></div></div>
        <div className={`hr-track ${running ? 'is-running' : ''} ${race ? 'is-finished' : ''}`}>
          <div className="hr-track-meta"><span>START</span><span>1200 M</span><span>FINISH <b>▥</b></span></div>
          {horses.map((horse, i) => <div className={`hr-lane ${race?.first.id === horse.id ? 'lane-winner' : ''} ${race?.second.id === horse.id ? 'lane-placed' : ''}`} key={horse.id}>
            <span className="hr-lane-number" style={{ '--silk': horse.silk }}>{horse.id}</span>
            <div className="hr-lane-ground"><span className="hr-gate">▥</span><span className="hr-runner" style={{ '--silk': horse.silk, '--lane': i, '--finish': race?.first.id === horse.id ? '1' : race?.second.id === horse.id ? '.86' : '.72' }}>🏇</span><span className="hr-finish-line"/></div>
            {race?.first.id === horse.id && <b className="hr-result-badge">1ST</b>}
            {race?.second.id === horse.id && <b className="hr-result-badge place">2ND</b>}
          </div>)}
          {!horses.length && <div className="hr-track-loading">Loading the field…</div>}
        </div>
        <div className="hr-commentary"><span className={running ? 'commentary-live' : ''}>●</span>{running ? 'And they’re off! The field is charging down the home stretch…' : race ? `${race.first.name} takes the win, with ${race.second.name} in second.` : 'The runners are heading to the gates. Pick your horse below.'}<small>RACE #{race ? '105' : '104'}</small></div>
        {race && <div className={`hr-payout-banner ${race.placed ? 'won' : ''}`}><b>{race.placed ? `🏆 BET WON · ₹${money(race.win)}` : 'RACE COMPLETE · BET NOT PLACED'}</b><span>1st {race.first.name} · 2nd {race.second.name}</span></div>}
      </section>

      <section className="hr-betting">
        <div className="hr-betting-head"><div><span className="hr-eyebrow">PLACE YOUR WAGER</span><h2>Race card</h2></div><div className="hr-type-toggle"><button className={betType==='win'?'active':''} onClick={()=>setBetType('win')} disabled={busy}>WIN <small>1ST</small></button><button className={betType==='place'?'active':''} onClick={()=>setBetType('place')} disabled={busy}>PLACE <small>TOP 2</small></button></div></div>
        <p className="hr-hint">Choose one runner. Win backs first place; Place backs a top two finish.</p>
        <div className="hr-horses">{horses.map((horse) => <button className={`hr-horse ${horseId===horse.id?'selected':''}`} key={horse.id} onClick={()=>setHorseId(horse.id)} disabled={busy}>
          <span className="hr-silk" style={{ '--silk':horse.silk }}>{horse.id}<i/></span><span className="hr-horse-copy"><strong>{horse.name}</strong><small>{horse.jockey} · Form {horse.form}</small></span><span className="hr-odds"><small>{betType==='win'?'WIN':'PLACE'}</small><b>{betType==='win'?horse.winOdds:horse.placeOdds}×</b></span>
        </button>)}</div>
      </section>

      <section className="hr-slip"><div className="hr-slip-top"><div><span className="hr-eyebrow">BET SLIP</span><strong>{picked?.name || 'Select a horse'}</strong><small>{betType==='win'?'To finish 1st':'To finish in the top 2'}</small></div><div className="hr-return"><small>EST. RETURN</small><b>₹{money(estimatedReturn)}</b></div></div>
        <div className="hr-chip-row">{CHIPS.map((chip) => <button key={chip} onClick={()=>setAmount(chip)} disabled={busy} className={Number(amount)===chip?'active':''}>₹{chip}</button>)}<label><span>₹</span><input aria-label="Bet amount" type="number" min={rules?.minBet ?? 1} max={rules?.maxBet ?? 10000} value={amount} onChange={(e)=>setAmount(e.target.value)} disabled={busy}/></label></div>
        {error && <p className="hr-error">{error}</p>}
        {!rules?.enabled && rules && <p className="hr-error">Horse racing is currently paused.</p>}
        <button className="hr-submit" onClick={placeBet} disabled={busy || !rules?.enabled || !horseId}>{busy ? <><span className="hr-spinner"/> RACE IN PROGRESS</> : <>PLACE BET <span>₹{money(amount)}</span></>}</button>
        <p className="hr-limits">Bet limits ₹{money(rules?.minBet)} – ₹{money(rules?.maxBet)} · Returns capped at ₹{money(rules?.maxWin)}</p>
      </section>
    </div>
  </main>
}
