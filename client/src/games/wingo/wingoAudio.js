// Web Audio synth for Win Go — countdown pips in the last seconds, bet click, win / loss chimes.

export function createWingoAudio() {
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
    unlock: () => ensure(),
    click: () => tone('sine', [540, 300], 0.03, 0.06, 0.06),
    pip: (last) => tone('square', [last ? 1320 : 880], 0, 0.05, last ? 0.25 : 0.1),
    win: () => tone('triangle', [523.25, 659.25, 783.99, 1046.5], 0.08, 0.12, 0.5),
    lose: () => tone('sine', [330, 247], 0.1, 0.07, 0.3),
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
