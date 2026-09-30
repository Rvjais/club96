// Web Audio synth for Poker — card snap, chip clink, table knock, fold swish, your-turn ping, win chord.

export function createPokerAudio() {
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

  function noise(freq, length, peak) {
    const c = ensure()
    if (!c) return
    const t = c.currentTime
    const len = Math.floor(c.sampleRate * length)
    const buffer = c.createBuffer(1, len, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buffer
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    const gain = c.createGain()
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + length)
    src.connect(filter).connect(gain).connect(c.destination)
    src.start(t)
  }

  const sounds = {
    card: () => noise(1400, 0.06, 0.5),
    chip: () => tone('sine', [2400, 800], 0.05, 0.12, 0.09),
    check: () => { tone('triangle', [180], 0, 0.3, 0.05); tone('triangle', [180], 0, 0.3, 0.05, 0.08) },
    fold: () => noise(600, 0.12, 0.25),
    turn: () => tone('sine', [880, 1320], 0.08, 0.08, 0.22),
    win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', [f], 0, 0.14, 0.35, i * 0.06)),
  }
  const KIND = { deal: 'card', board: 'card', show: 'card', chip: 'chip', check: 'check', fold: 'fold', win: 'win' }

  return {
    setEnabled(v) { enabled = v },
    play(kind) { sounds[KIND[kind]]?.() },
    ...sounds,
    dispose() {
      if (ctx) ctx.close().catch(() => {})
    },
  }
}
