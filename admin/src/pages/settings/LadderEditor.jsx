import { useState } from 'react'
import { Icon } from '../../Icons'
import { pct, toNum } from './settingsForm'

const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100

/**
 * Editable payout ladder (one multiplier per step) for Mines and Tower.
 * Under each value: the chance of reaching that step and the return to player
 * if the player cashes out there (payout × chance).
 *
 * values   string[] shown in the inputs
 * chances  number[] (0–1) chance of surviving to each step
 * stepLabel(i) label for step i ("Gem 3", "Level 3")
 */
export default function LadderEditor({ values, chances, stepLabel, custom, onChange, onFill, onReset }) {
  const [target, setTarget] = useState('97')
  const t = toNum(target)
  const rtps = values.map((v, i) => (toNum(v) || 0) * chances[i] * 100)
  const worst = Math.max(...rtps)

  return (
    <div className="ladder">
      <div className="ladder-bar">
        <span className={`ladder-mode ${custom ? 'is-custom' : ''}`}>
          <Icon name={custom ? 'sliders' : 'activity'} size={13} />
          {custom ? 'Custom payouts' : 'Using house-edge formula'}
        </span>
        <div className="ladder-tools">
          <div className="input input-sm" title="Fill every step so each cash-out returns this share of stakes">
            <span className="input-prefix">RTP</span>
            <input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target return to player" />
            <span className="input-suffix">%</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!(t > 0)} onClick={() => onFill(chances.map((c) => String(floor2(t / 100 / c))))}>
            Fill row
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!custom} onClick={onReset}>
            <Icon name="refresh" size={13} /> Use formula
          </button>
        </div>
      </div>

      <div className="ladder-grid">
        {values.map((v, i) => {
          const rtp = rtps[i]
          const drop = i > 0 && toNum(v) < toNum(values[i - 1])
          return (
            <label key={i} className={`ladder-cell ${rtp > 100 ? 'is-bad' : ''} ${drop ? 'is-warn' : ''}`}>
              <span>{stepLabel(i)}</span>
              <div className="ladder-input">
                <input type="number" step="any" value={v} onChange={(e) => onChange(i, e.target.value)} aria-label={`${stepLabel(i)} payout`} />
                <em>x</em>
              </div>
              <small title="Return to player if they cash out here">{pct(rtp)} RTP</small>
              <small className="ladder-chance" title="Chance of reaching this step">{chances[i] * 100 >= 0.01 ? pct(chances[i] * 100) : '<0.01%'} reach</small>
            </label>
          )
        })}
      </div>

      {worst > 100 && (
        <div className="alert alert-error"><Icon name="alert" size={15} /> Red steps pay back more than players stake on average — the house loses money when players cash out there.</div>
      )}
      {values.some((v, i) => i > 0 && toNum(v) < toNum(values[i - 1])) && (
        <div className="alert alert-warn"><Icon name="alert" size={15} /> A later step pays less than the one before it (amber), so players would never go past it.</div>
      )}
    </div>
  )
}
