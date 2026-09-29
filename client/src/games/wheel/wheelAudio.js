// Web Audio synth for Wheel — peg ticks while spinning, win fanfare scaled to the prize.

export function createWheelAudio() {
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
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + length + 0.02)
  }

  return {
    setEnabled(v) { enabled = v },
    click: () => tone('sine', [520, 300], 0.03, 0.06, 0.06),
    tick: () => tone('square', [1800, 900], 0.008, 0.025, 0.03),
    win(mult) {
      if (mult >= 5) tone('triangle', [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 0.07, 0.13, 0.7)
      else tone('triangle', [523.25, 659.25, 783.99], 0.07, 0.1, 0.35)
    },
    lose: () => tone('sine', [320, 220], 0.1, 0.07, 0.3),
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
