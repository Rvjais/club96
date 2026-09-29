// Web Audio synth for Dice — slider ticks, a rattling roll, win / lose stings.

export function createDiceAudio() {
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

  function tone(type, freqs, step, peak, length, delay = 0) {
    const c = ensure()
    if (!c) return
    const t = c.currentTime + delay
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
    click: () => tone('sine', [520, 300], 0.03, 0.06, 0.06),
    tick() {
      const now = performance.now()
      if (now - lastTick < 35) return
      lastTick = now
      tone('triangle', [1400], 0, 0.02, 0.03)
    },
    shake() {
      for (let i = 0; i < 6; i++) tone('square', [180 + Math.random() * 120], 0, 0.03, 0.04, i * 0.07)
    },
    win: () => tone('triangle', [659.25, 880, 1174.66], 0.07, 0.12, 0.4),
    lose: () => tone('sine', [300, 200], 0.09, 0.08, 0.28),
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
