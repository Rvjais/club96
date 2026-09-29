// Web Audio synth for Plinko — soft peg ticks and a landing chime that
// sounds brighter for bigger multipliers.

export function createPlinkoAudio() {
  let ctx = null
  let enabled = true
  let lastTick = 0

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
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + length + 0.02)
  }

  return {
    setEnabled(v) { enabled = v },
    unlock: () => ensure(),
    peg(row) {
      const now = performance.now()
      if (now - lastTick < 28) return // many balls at once → don't stack clicks
      lastTick = now
      tone('triangle', [1100 + row * 25], 0, 0.025, 0.035)
    },
    land(mult) {
      if (mult >= 10) tone('triangle', [523.25, 659.25, 783.99, 1046.5, 1318.5], 0.06, 0.13, 0.55)
      else if (mult >= 1) tone('sine', [660, 880], 0.06, 0.08, 0.22)
      else tone('sine', [330, 262], 0.06, 0.05, 0.18)
    },
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
