// Web Audio synth for Tower — step up (pitch climbs with the level), trap, reaching the top / cash-out.

export function createTowerAudio() {
  let ctx = null
  let enabled = true

  function ensure() {
    if (!enabled) return null
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  function tone(type, freqs, step, peak, length) {
    const c = ensure()
    if (!c) return
    const t = c.currentTime
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * step))
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + length + 0.02)
  }

  return {
    setEnabled(v) { enabled = v },
    click: () => tone('sine', [480, 240], 0.03, 0.06, 0.06),
    step: (level) => {
      const base = 392 * 2 ** (level / 12) // one semitone higher per level
      tone('triangle', [base, base * 1.5], 0.06, 0.1, 0.22)
    },
    trap: () => tone('sawtooth', [220, 110, 55], 0.08, 0.14, 0.4),
    cashout: () => tone('triangle', [523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, 0.12, 0.55),
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
