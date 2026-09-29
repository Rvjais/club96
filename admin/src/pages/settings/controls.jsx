import { Icon } from '../../Icons'

export function NumberField({ label, suffix, prefix, value, onChange, hint, step = 'any' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input">
        {prefix && <span className="input-prefix">{prefix}</span>}
        <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function Toggle({ enabled, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={enabled} className={`live-toggle ${enabled ? 'is-on' : ''}`} onClick={() => onChange(!enabled)}>
      <span className="live-toggle-knob" />
      {enabled ? 'Live' : 'Paused'}
    </button>
  )
}

export function SaveBar({ dirty, busy, msg, onSave, onReset, onDefaults, invalid }) {
  return (
    <div className="save-bar">
      {msg && <div className={`alert alert-${msg.kind}`}><Icon name={msg.kind === 'success' ? 'checkCircle' : 'alert'} size={15} /> {msg.text}</div>}
      <div className="save-bar-btns">
        <button type="button" className="btn btn-ghost" onClick={onDefaults}>Load defaults</button>
        <button type="button" className="btn btn-ghost" onClick={onReset} disabled={!dirty || busy}>Discard</button>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || busy || invalid}>
          {busy ? <span className="spinner spinner-sm spinner-light" /> : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/** Card header: game name + live / paused switch. */
export function CardHead({ icon, title, f }) {
  return (
    <div className="game-card-head">
      <h2 className="card-title"><Icon name={icon} size={16} /> {title}</h2>
      <Toggle enabled={f.form.enabled} onChange={f.set('enabled')} />
    </div>
  )
}

/** Stake limits + per-round win cap. */
export function LimitFields({ f }) {
  return (
    <>
      <NumberField label="Minimum bet" prefix="₹" value={f.form.minBet} onChange={f.set('minBet')} />
      <NumberField label="Maximum bet" prefix="₹" value={f.form.maxBet} onChange={f.set('maxBet')} />
      <NumberField label="Maximum win" prefix="₹" value={f.form.maxWin} onChange={f.set('maxWin')} hint="Cap on any single payout" />
    </>
  )
}

export function FormSaveBar({ f, invalid }) {
  return <SaveBar dirty={f.dirty} busy={f.busy} msg={f.msg} invalid={invalid} onSave={f.save} onReset={f.reset} onDefaults={f.loadDefaults} />
}
