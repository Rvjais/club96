import { useState } from 'react'
import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const PREVIEW = [1.5, 2, 5, 10, 100]
const r2 = (n) => Math.round(n * 100) / 100

/**
 * % of rounds that reach x. Formula: min(100 − instant, (100 − edge) / x).
 * Custom odds: the admin's points joined on a log–log scale, falling like 1/x after the last
 * point — the same curve the server uses (server/src/games/aviator.js).
 */
function reachChance(x, { edge, instant, maxMult, curve }) {
  if (x > maxMult) return 0
  if (x <= 1) return 100
  if (!curve) return Math.min(100 - instant, (100 - edge) / x)
  const pts = [{ mult: 1, chance: 100 - instant }, ...curve]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (x > b.mult) continue
    return a.chance * (x / a.mult) ** (Math.log(b.chance / a.chance) / Math.log(b.mult / a.mult))
  }
  const last = pts[pts.length - 1]
  return (last.mult * last.chance) / x
}

/** First problem with the custom points, or null. */
function curveError(points, instant, maxMult) {
  let prev = { mult: 1, chance: 100 - instant }
  for (const [i, p] of points.entries()) {
    const n = i + 1
    if (Number.isNaN(p.mult) || Number.isNaN(p.chance)) return `Point ${n}: enter a multiplier and a chance`
    if (p.mult <= prev.mult) return `Point ${n}: multipliers must go up`
    if (p.mult > maxMult) return `Point ${n}: above the max multiplier (${maxMult}x)`
    if (p.chance <= 0) return `Point ${n}: chance must be above 0%`
    if (p.chance > prev.chance) return i === 0 ? `Point 1: at most ${r2(prev.chance)}% can reach it (the rest crash instantly)` : `Point ${n}: chances must go down`
    prev = p
  }
  return null
}

export default function AviatorSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('aviator', saved, defaults, onSaved, 'Saved. Odds apply from the next round; limits apply now.')
  const [target, setTarget] = useState('97')

  const edge = toNum(f.form.houseEdge)
  const instant = toNum(f.form.instantCrash)
  const maxMult = toNum(f.form.maxMultiplier)
  const points = (f.form.curve ?? []).map((p) => ({ mult: toNum(p.mult), chance: toNum(p.chance) }))
  const custom = points.length > 0
  const basicsOk = ![edge, instant, maxMult].some(Number.isNaN)
  const error = custom && basicsOk ? curveError(points, instant, maxMult) : null
  const model = { edge, instant, maxMult, curve: custom && !error ? points : null }
  const reach = (x) => (basicsOk && !(custom && error) ? reachChance(x, model) : NaN)

  const setPoints = (list) => f.setForm((form) => ({ ...form, curve: list }))
  const setPoint = (i, key, v) => setPoints(f.form.curve.map((p, j) => (j === i ? { ...p, [key]: v } : p)))

  // Start custom odds from what the formula gives today
  const startCustom = () => setPoints(PREVIEW.filter((x) => !(x > maxMult)).map((x) => ({
    mult: String(x),
    chance: String(r2(Math.min(100 - (instant || 0), (100 - (edge || 0)) / x))),
  })))

  const addPoint = () => {
    const last = points[points.length - 1] ?? { mult: 1, chance: 100 - instant }
    const mult = Math.min(maxMult, r2(last.mult * 2))
    setPoints([...f.form.curve, { mult: String(mult), chance: String(r2(last.chance / 2)) }])
  }

  const fillRtp = () => {
    const t = toNum(target)
    setPoints(f.form.curve.map((p) => ({ ...p, chance: String(r2(Math.min(100 - instant, t / toNum(p.mult)))) })))
  }

  const rtps = points.map((p) => p.mult * p.chance)

  return (
    <section className="card game-card">
      <CardHead icon="plane" title="Aviator" f={f} />

      <div className="settings-grid">
        <NumberField label="House edge" suffix="%" value={f.form.houseEdge} onChange={f.set('houseEdge')} hint={custom ? 'Not used while custom odds are on' : 'Share of every stake the house keeps on average'} />
        <NumberField label="Instant crash chance" suffix="%" value={f.form.instantCrash} onChange={f.set('instantCrash')} hint="Rounds that end at 1.00x" />
        <NumberField label="Max multiplier" suffix="x" value={f.form.maxMultiplier} onChange={f.set('maxMultiplier')} />
        <NumberField label="Minimum bet" prefix="₹" value={f.form.minBet} onChange={f.set('minBet')} />
        <NumberField label="Maximum bet" prefix="₹" value={f.form.maxBet} onChange={f.set('maxBet')} />
      </div>

      <div className="preview">
        <div className="preview-main">
          <span>Return to player</span>
          {custom ? (
            <>
              <strong>{error || !rtps.length ? '—' : `${pct(Math.min(...rtps))}–${pct(Math.max(...rtps))}`}</strong>
              <small>Depends on where players cash out</small>
            </>
          ) : (
            <>
              <strong>{Number.isNaN(edge) ? '—' : pct(100 - edge)}</strong>
              <small>House keeps {Number.isNaN(edge) ? '—' : pct(edge)} of stakes</small>
            </>
          )}
        </div>
        <div className="preview-table">
          <span className="preview-caption">Chance a round reaches…</span>
          {PREVIEW.map((x) => (
            <div key={x}><span>{x}x</span><strong>{Number.isNaN(reach(x)) ? '—' : pct(reach(x))}</strong></div>
          ))}
        </div>
      </div>

      <div>
        <div className="sub-head">
          <strong>Crash odds</strong>
          <div className="seg-mini">
            <button type="button" className={!custom ? 'is-active' : ''} onClick={() => setPoints([])}>House-edge formula</button>
            <button type="button" className={custom ? 'is-active' : ''} onClick={() => !custom && startCustom()} disabled={!basicsOk}>Custom odds</button>
          </div>
        </div>

        {!custom ? (
          <p className="field-hint">
            Every cash-out target returns {Number.isNaN(edge) ? '—' : pct(100 - edge)} on average. Switch to custom odds to set exactly how often
            rounds reach each multiplier.
          </p>
        ) : (
          <div className="ladder">
            <div className="ladder-bar">
              <span className="ladder-mode is-custom"><Icon name="sliders" size={13} /> Custom odds — % of rounds that reach each multiplier</span>
              <div className="ladder-tools">
                <div className="input input-sm" title="Set each chance so cashing out at that multiplier returns this share of stakes">
                  <span className="input-prefix">RTP</span>
                  <input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target return to player" />
                  <span className="input-suffix">%</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!(toNum(target) > 0)} onClick={fillRtp}>Fill chances</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={points.length >= 12} onClick={addPoint}><Icon name="plus" size={13} /> Add point</button>
              </div>
            </div>

            <div className="ladder-grid odds-grid">
              {f.form.curve.map((p, i) => {
                const rtp = rtps[i]
                return (
                  <div key={i} className={`ladder-cell ${rtp > 100 ? 'is-bad' : ''}`}>
                    <div className="odds-cell-head">
                      <span>Point {i + 1}</span>
                      <button type="button" className="odds-remove" onClick={() => setPoints(f.form.curve.filter((_, j) => j !== i))} aria-label={`Remove point ${i + 1}`}>
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                    <div className="ladder-input">
                      <input type="number" step="any" value={p.mult} onChange={(e) => setPoint(i, 'mult', e.target.value)} aria-label={`Point ${i + 1} multiplier`} />
                      <em>x</em>
                    </div>
                    <div className="ladder-input">
                      <input type="number" step="any" value={p.chance} onChange={(e) => setPoint(i, 'chance', e.target.value)} aria-label={`Point ${i + 1} chance`} />
                      <em>%</em>
                    </div>
                    <small>{Number.isNaN(rtp) ? '—' : pct(rtp)} RTP</small>
                  </div>
                )
              })}
            </div>

            <p className="field-hint">
              Between points the chance falls smoothly; above the last point it keeps falling like the normal curve, up to the max multiplier.
              RTP is what players get back on average if they always cash out at that multiplier.
            </p>
            {error && <div className="alert alert-error"><Icon name="alert" size={15} /> {error}</div>}
            {!error && rtps.some((r) => r > 100) && (
              <div className="alert alert-error"><Icon name="alert" size={15} /> Red points pay back more than players stake — the house loses money on players who cash out there.</div>
            )}
          </div>
        )}
      </div>

      <FormSaveBar f={f} invalid={!!error} />
    </section>
  )
}
