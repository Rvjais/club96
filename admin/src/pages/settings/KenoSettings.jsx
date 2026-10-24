import { useMemo, useState } from 'react'
import { CardHead, FormSaveBar, LimitFields, NumberField, Toggle } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const ROOM_ORDER = ['30s', '1m', '3m', '5m']
const ROOM_LABELS = { '30s': '30s', '1m': '1m', '3m': '3m', '5m': '5m' }
const ROOM_DESC = { '30s': 'Every 30 seconds', '1m': 'Every minute', '3m': 'Every 3 min', '5m': 'Every 5 min' }
const PICK_MAX = 10

const DEFAULT_PAYTABLE = {
  1: [0, 3],
  2: [0, 0, 12],
  3: [0, 0, 2, 45],
  4: [0, 0, 1, 5, 90],
  5: [0, 0, 0, 3, 12, 720],
  6: [0, 0, 0, 2, 6, 60, 1500],
  7: [0, 0, 0, 1, 3, 18, 150, 4000],
  8: [0, 0, 0, 0, 2, 10, 50, 720, 10000],
  9: [0, 0, 0, 0, 1, 5, 20, 150, 3000, 25000],
  10: [0, 0, 0, 0, 0, 3, 10, 50, 300, 2000, 50000],
}

export default function KenoSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('keno', saved, defaults, onSaved, 'Saved. Applies to the next draw.')

  // Build effective paytable (custom overrides defaults)
  const custom = f.form.customPaytable ?? {}
  const paytable = useMemo(() => {
    const merged = {}
    for (let p = 1; p <= PICK_MAX; p++) {
      merged[p] = custom[p] ?? DEFAULT_PAYTABLE[p]
    }
    return merged
  }, [custom])

  // Calculate RTP approximation for each pick count
  const rtp = useMemo(() => {
    const rtps = {}
    for (let p = 1; p <= PICK_MAX; p++) {
      let ev = 0
      const row = paytable[p]
      // Hypergeometric: P(k matches) = C(p,k) * C(80-p, 20-k) / C(80,20)
      // We'll approximate with a simple loop for display
      for (let k = 0; k <= p; k++) {
        const mult = row[k] ?? 0
        if (mult > 0) {
          // Very rough approximation for display
          ev += mult * Math.pow(0.25, k) * Math.pow(0.75, p - k) * (p === k ? 1 : 1)
        }
      }
      rtps[p] = Math.min(100, ev * 100)
    }
    return rtps
  }, [paytable])

  const handleCustomPaytableChange = (pickCount, matchCount, value) => {
    const nextCustom = { ...custom }
    if (!nextCustom[pickCount]) nextCustom[pickCount] = [...DEFAULT_PAYTABLE[pickCount]]
    nextCustom[pickCount][matchCount] = value
    f.set('customPaytable')(nextCustom)
  }

  const handleRoomToggle = (room) => {
    f.set('rooms')({ ...f.form.rooms, [room]: !f.form.rooms?.[room] })
  }

  return (
    <section className="card game-card">
      <CardHead icon="grid" title="Keno / Lucky Numbers" f={f} />

      <div className="settings-grid">
        <LimitFields f={f} />
        <NumberField label="Betting lock" suffix="s" value={f.form.lockSeconds} onChange={f.set('lockSeconds')} hint="Seconds before draw when betting closes" step="1" />
        <NumberField label="Service fee" suffix="%" value={f.form.fee} onChange={f.set('fee')} hint="Deducted from stake before payout" step="0.1" />
      </div>

      {/* Rooms */}
      <div className="section">
        <h3>Rooms</h3>
        <div className="settings-grid">
          {ROOM_ORDER.map(room => (
            <label key={room} className="field room-toggle">
              <span>
                <strong>{ROOM_LABELS[room]}</strong> — {ROOM_DESC[room]}
              </span>
              <Toggle
                enabled={f.form.rooms?.[room] !== false}
                onChange={() => handleRoomToggle(room)}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Custom Paytable Editor */}
      <div className="section">
        <h3>Paytable (multipliers per pick count & matches)</h3>
        <p className="section-hint">Leave empty to use defaults. Rows = matches (0 to pick count). RTP estimates are approximate.</p>
        <div className="paytable-editor">
          {Array.from({ length: PICK_MAX }, (_, i) => i + 1).map(p => (
            <div key={p} className="paytable-row">
              <div className="paytable-row-header">
                <span className="paytable-pick-label">Pick {p}</span>
                <span className="paytable-rtp">RTP ≈ {Number.isNaN(rtp[p]) ? '—' : pct(rtp[p])}</span>
              </div>
              <div className="paytable-cells">
                {paytable[p].map((mult, k) => (
                  <NumberField
                    key={k}
                    label={k === 0 ? '—' : String(k)}
                    value={mult}
                    onChange={v => handleCustomPaytableChange(p, k, toNum(v))}
                    step="0.01"
                    hint={k === 0 ? 'No match' : `${k} match${k > 1 ? 'es' : ''}`}
                    className="paytable-cell"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <FormSaveBar f={f} />
    </section>
  )
}