import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import { api } from '../../lib/api'
import GameShell from '../lib/GameShell'
import './HorseRacing.css'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const CHIPS = [50, 100, 250, 500]

export default function HorseRacing() {
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

  // wallet-track refresh (header spinner) — keeps the current selection
  const refreshState = () => api.get('/games/horse-racing/state').then((data) => {
    setRules(data.rules)
    setHorses(data.horses)
  }).catch(() => {})

  const minBet = rules?.minBet ?? 1
  const maxBet = rules?.maxBet ?? 10000
  const halfBet = () => setAmount(a => Math.max(minBet, Math.floor((Number(a) || 0) / 2) || minBet))
  const doubleBet = () => setAmount(a => Math.min(maxBet, Math.max(minBet, Math.floor((Number(a) || 0) * 2))))
  const maxStake = () => setAmount(Math.max(minBet, Math.min(maxBet, Math.floor(Number(balance) || 0))))

  const eyebrow = running ? 'RACE IN PROGRESS' : race ? 'RESULT' : 'NEXT RACE · 1200M'

  return (
    <GameShell
      icon="trophy"
      title="Horse Racing"
      tagline="Royal turf derby"
      accent="#f4c453"
      busy={busy}
      onRefresh={refreshState}
      wide
      footer={(
        <div className="hr-dock">
          <div className="hr-toggle">
            <button type="button" className={betType === 'win' ? 'is-on' : ''} onClick={() => setBetType('win')} disabled={busy}>
              WIN <small>1st</small>
            </button>
            <button type="button" className={betType === 'place' ? 'is-on' : ''} onClick={() => setBetType('place')} disabled={busy}>
              PLACE <small>top 2</small>
            </button>
          </div>
          <div className="gs-input-row">
            <div className="gs-field">
              <span className="gs-cur">₹</span>
              <input
                className="gs-input"
                type="number"
                min={minBet}
                max={maxBet}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                inputMode="decimal"
                aria-label="Bet amount"
              />
            </div>
            <button type="button" className="gs-chip" onClick={halfBet} disabled={busy}>1/2</button>
            <button type="button" className="gs-chip" onClick={doubleBet} disabled={busy}>2×</button>
            <button type="button" className="gs-chip" onClick={maxStake} disabled={busy}>MAX</button>
          </div>
          <div className="gs-quick">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setAmount(chip)}
                disabled={busy}
                className={`gs-chip ${Number(amount) === chip ? 'is-on' : ''}`}
              >
                ₹{chip}
              </button>
            ))}
          </div>
          {error && <p className="hr-error">{error}</p>}
          {!rules?.enabled && rules && <p className="hr-error">Horse racing is currently paused.</p>}
          <button type="button" className="gs-cta" onClick={placeBet} disabled={busy || !rules?.enabled || !horseId}>
            <Icon name={busy ? 'refresh' : 'flag'} size={17} strokeWidth={2.6} />
            {busy ? 'RACING…' : <>PLACE BET&nbsp;<em>₹{money(amount)}</em></>}
          </button>
        </div>
      )}
    >
      <div className="hr-layout">
        <section className="gs-stage hr-areastage">
          <div className="hr-card-head">
            <div>
              <span className="hr-eyebrow"><i /> {eyebrow}</span>
              <h1>Royal Sprint</h1>
              <p>Six thoroughbreds. One finish line.</p>
            </div>
            <div className="hr-condition" aria-hidden="true">
              <span>☀</span>
              <div><b>GOOD</b><small>TURF CONDITION</small></div>
            </div>
          </div>

          <div className={`hr-track ${running ? 'is-running' : ''} ${race ? 'is-finished' : ''}`}>
            <div className="hr-track-meta"><span>START</span><span>1200 M</span><span>FINISH <b>▥</b></span></div>
            {horses.map((horse, i) => (
              <div
                key={horse.id}
                className={`hr-lane ${race?.first.id === horse.id ? 'lane-winner' : ''} ${race?.second.id === horse.id ? 'lane-placed' : ''}`}
              >
                <span className="hr-lane-number" style={{ '--silk': horse.silk }}>{horse.id}</span>
                <div className="hr-lane-ground">
                  <span className="hr-gate" aria-hidden="true">▥</span>
                  <span
                    className="hr-runner"
                    style={{ '--silk': horse.silk, '--lane': i, '--finish': race?.first.id === horse.id ? '1' : race?.second.id === horse.id ? '.86' : '.72' }}
                    aria-hidden="true"
                  >
                    🏇
                  </span>
                  <span className="hr-finish-line" aria-hidden="true" />
                </div>
                {race?.first.id === horse.id && <b className="hr-result-badge">1ST</b>}
                {race?.second.id === horse.id && <b className="hr-result-badge place">2ND</b>}
              </div>
            ))}
            {!horses.length && <div className="hr-track-loading">Loading the field…</div>}
          </div>

          <div className="hr-commentary">
            <span className={running ? 'commentary-live' : ''} aria-hidden="true">●</span>
            {running
              ? 'And they’re off! The field is charging down the home stretch…'
              : race
                ? `${race.first.name} takes the win, with ${race.second.name} in second.`
                : 'The runners are heading to the gates. Pick your horse below.'}
          </div>

          {race && (
            <div className={`gs-banner ${race.placed ? 'win' : 'loss'}`}>
              {race.placed ? `🏆 BET WON — +${money(race.win)}` : 'RACE COMPLETE · BET NOT PLACED'}
            </div>
          )}
          {race && (
            <div className="hr-banner-sub">1st {race.first.name} · 2nd {race.second.name}</div>
          )}
        </section>

        <div className="gs-stats hr-areastats">
          <div className="gs-stat">
            <b className="hr-stat-pick" style={picked ? { '--silk': picked.silk } : undefined}>{picked?.name || '—'}</b>
            <span>Picked</span>
          </div>
          <div className="gs-stat">
            <b>{betType === 'win' ? 'WIN' : 'PLACE'}</b>
            <span>Bet type</span>
          </div>
          <div className="gs-stat">
            <b>{money(estimatedReturn)}</b>
            <span>Est. return</span>
          </div>
        </div>

        <section className="gs-panel hr-areahorses">
          <div className="gs-panel-title">The field</div>
          <p className="hr-hint">Win backs first place · Place backs a top two finish.</p>
          <div className="hr-horses">
            {horses.map((horse) => (
              <button
                type="button"
                className={`hr-horse ${horseId === horse.id ? 'is-on' : ''}`}
                key={horse.id}
                onClick={() => setHorseId(horse.id)}
                disabled={busy}
              >
                <span className="hr-silk" style={{ '--silk': horse.silk }}>{horse.id}<i aria-hidden="true" /></span>
                <span className="hr-horse-copy">
                  <strong>{horse.name}</strong>
                  <small>{horse.jockey} · Form {horse.form}</small>
                </span>
                <span className="hr-odds">
                  <small>{betType === 'win' ? 'WIN' : 'PLACE'}</small>
                  <b>{betType === 'win' ? horse.winOdds : horse.placeOdds}×</b>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </GameShell>
  )
}
