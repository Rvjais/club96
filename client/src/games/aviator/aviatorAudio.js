// Web Audio synth for the Aviator game — engine hum, cashout chime, crash burst.

export function createAviatorAudio() {
  let ctx = null
  let enabled = true
  let engine = null // { osc, gain }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  function engineStop(fade = 0.15) {
    if (!engine || !ctx) return
    const { osc, gain } = engine
    engine = null
    const t = ctx.currentTime
    try {
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(gain.gain.value, t)
      gain.gain.linearRampToValueAtTime(0, t + fade)
      osc.stop(t + fade + 0.02)
    } catch { /* already stopped */ }
  }

  return {
    /** Call from a user gesture so browsers allow playback. */
    unlock() {
      if (enabled) ensure()
    },

    setEnabled(v) {
      enabled = v
      if (!v) engineStop()
    },

    engineStart() {
      if (!enabled || !ensure()) return
      engineStop(0.05)
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(110, t)
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(380, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.035, t + 0.4)
      osc.connect(filter).connect(gain).connect(ctx.destination)
      osc.start(t)
      engine = { osc, gain }
    },

    engineUpdate(mult) {
      if (!engine || !ctx) return
      const target = Math.min(720, 110 + Math.log(mult) * 170)
      engine.osc.frequency.setTargetAtTime(target, ctx.currentTime, 0.12)
    },

    engineStop,

    cashout() {
      if (!enabled || !ensure()) return
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.07))
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.52)
    },

    crash() {
      engineStop(0.05)
      if (!enabled || !ensure()) return
      const t = ctx.currentTime
      const len = Math.floor(ctx.sampleRate * 0.45)
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(700, t)
      filter.frequency.exponentialRampToValueAtTime(40, t + 0.45)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.45)
      noise.connect(filter).connect(gain).connect(ctx.destination)
      noise.start(t)
    },

    dispose() {
      engineStop(0.01)
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}
