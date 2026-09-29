// Web Audio synth for Mines — tile click, gem chime (rises with each gem), explosion, cash-out.

export function createMinesAudio() {
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
    click: () => tone('sine', [520, 260], 0.03, 0.06, 0.06),
    gem: (n) => tone('sine', [620 + n * 40, 930 + n * 55], 0.05, 0.09, 0.2),
    cashout: () => tone('triangle', [523.25, 659.25, 783.99, 1046.5], 0.07, 0.12, 0.45),
    boom() {
      const c = ensure()
      if (!c) return
      const t = c.currentTime
      const len = Math.floor(c.sampleRate * 0.5)
      const buffer = c.createBuffer(1, len, c.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      const noise = c.createBufferSource()
      noise.buffer = buffer
      const filter = c.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(900, t)
      filter.frequency.exponentialRampToValueAtTime(40, t + 0.5)
      const gain = c.createGain()
      gain.gain.setValueAtTime(0.22, t)
      gain.gain.exponentialRampToValueAtTime(0.004, t + 0.5)
      noise.connect(filter).connect(gain).connect(c.destination)
      noise.start(t)
    },
    dispose() {
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
