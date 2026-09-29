// ─────────────────────────────────────────────────────────────
// Aviator game engine — pure state machine, no React.
// Phases: waiting (betting open) → flying → crashed → waiting …
// The UI subscribes via onState (discrete changes), onFrame
// (every animation frame) and onEvent (sounds / toasts).
// ─────────────────────────────────────────────────────────────

export const WAIT_MS = 6000
export const CRASH_HOLD_MS = 3500
export const START_BALANCE = 1000
export const MAX_BET = 10000
export const MAX_CRASH = 1000

const SEED_HISTORY = [1.24, 2.5, 1.05, 14.2, 1.88, 3.12, 1.15, 8.45, 1.02, 2.05, 1.47, 5.66]
const BOT_NAMES = ['CryptoFlyer', 'LuckyJet', 'AcePilot', 'MoonRider', 'SkyHigh', 'RiskTaker', 'Aviation99', 'TurboMax', 'AlphaBet', 'DiamondHands', 'RocketMan', 'VortexUser', 'Rahul', 'Priya', 'Karan', 'Neha', 'Arjun', 'Simran']
const BOT_STAKES = [10, 20, 20, 50, 50, 100, 100, 200, 500, 1000]

// Multiplier growth curve (seconds → x)
export const multiplierAt = (sec) => 1 + 0.08 * sec + 0.02 * Math.pow(sec, 2.1)

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) return null
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Deterministic crash point from the round seed (3% house edge, 3% instant bust)
export function crashPointFromSeed(seed) {
  const r = (parseInt(seed.slice(0, 13), 16) / 2 ** 52) * 100
  if (r < 3) return 1
  return Math.min(MAX_CRASH, Math.max(1, Math.floor((97 / (100 - r)) * 100) / 100))
}

function maskName(name) {
  return `${name[0]}***${Math.floor(Math.random() * 10)}`
}

function makeBots() {
  const count = 14 + Math.floor(Math.random() * 10)
  const bots = []
  for (let i = 0; i < count; i++) {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    bots.push({
      id: `b${i}`,
      name: maskName(name),
      hue: Math.floor(Math.random() * 5),
      amount: BOT_STAKES[Math.floor(Math.random() * BOT_STAKES.length)],
      target: 1.1 + Math.pow(Math.random(), 2) * 7, // biased towards early cashouts
      cashMult: null,
      lost: false,
    })
  }
  return bots.sort((a, b) => b.amount - a.amount)
}

const newPanel = () => ({ status: 'idle', amount: 0 })

function initialState() {
  return {
    phase: 'waiting',
    phaseStart: 0,
    flightStart: 0,
    flightSec: 0,
    mult: 1,
    crashAt: 1,
    balance: START_BALANCE,
    history: [...SEED_HISTORY],
    panels: { 1: newPanel(), 2: newPanel() },
    auto: { 1: { enabled: false, value: 2 }, 2: { enabled: false, value: 3 } },
    bots: [],
    userRound: [], // the player's bets in the current flight
    myBets: [],
    round: { id: 48212, seed: '', hash: '' },
    prevRound: null,
  }
}

function toSnapshot(s) {
  return {
    phase: s.phase,
    balance: s.balance,
    crashAt: s.phase === 'crashed' ? s.crashAt : null,
    history: [...s.history],
    panels: { 1: { ...s.panels[1] }, 2: { ...s.panels[2] } },
    bots: s.bots.map((b) => ({ ...b })),
    userRound: s.userRound.map((u) => ({ ...u })),
    myBets: [...s.myBets],
    round: { id: s.round.id, hash: s.round.hash },
    prevRound: s.prevRound,
  }
}

export const getInitialSnapshot = () => toSnapshot(initialState())

export function createAviatorEngine({ onState, onFrame, onEvent }) {
  const s = initialState()
  let raf = 0
  let alive = false

  const emit = () => onState(toSnapshot(s))
  const event = (e) => onEvent(e)

  // ── Phase transitions ──────────────────────────────────────
  function startWaiting(now) {
    s.phase = 'waiting'
    s.phaseStart = now
    s.mult = 1
    s.flightSec = 0
    s.bots = makeBots()
    s.userRound = []

    const seed = randomHex()
    s.round = { id: s.round.id + 1, seed, hash: '' }
    s.crashAt = crashPointFromSeed(seed)
    const roundId = s.round.id
    sha256(seed).then((hash) => {
      if (!alive || s.round.id !== roundId) return
      s.round.hash = hash || seed.split('').reverse().join('')
      emit()
    })

    for (const id of [1, 2]) {
      if (s.panels[id].status === 'queued') s.panels[id].status = 'placed'
    }
    emit()
  }

  function startFlight(now) {
    s.phase = 'flying'
    s.phaseStart = now
    s.flightStart = now
    s.userRound = []
    for (const id of [1, 2]) {
      const p = s.panels[id]
      if (p.status === 'placed') {
        p.status = 'flying'
        s.userRound.push({ panel: id, amount: p.amount, cashMult: null, lost: false })
      }
    }
    event({ type: 'takeoff' })
    emit()
  }

  function crash(now) {
    s.phase = 'crashed'
    s.phaseStart = now
    s.mult = s.crashAt
    s.history.push(s.crashAt)
    if (s.history.length > 40) s.history.shift()

    let lostCount = 0
    for (const id of [1, 2]) {
      const p = s.panels[id]
      if (p.status === 'flying') {
        p.status = 'idle'
        lostCount++
        s.myBets.unshift({ key: `${s.round.id}-${id}`, round: s.round.id, panel: id, amount: p.amount, cashMult: null, crashAt: s.crashAt, win: 0, time: Date.now() })
      }
    }
    s.userRound.forEach((u) => { if (u.cashMult == null) u.lost = true })
    s.bots.forEach((b) => { if (b.cashMult == null) b.lost = true })
    s.myBets = s.myBets.slice(0, 30)
    s.prevRound = { id: s.round.id, seed: s.round.seed, hash: s.round.hash, crashAt: s.crashAt }

    event({ type: 'crash', crashAt: s.crashAt, lostCount })
    emit()
  }

  function cashOut(id) {
    const p = s.panels[id]
    if (s.phase !== 'flying' || p.status !== 'flying') return
    const mult = Math.floor(s.mult * 100) / 100
    const win = p.amount * mult
    s.balance += win
    p.status = 'idle'
    const entry = s.userRound.find((u) => u.panel === id)
    if (entry) entry.cashMult = mult
    s.myBets.unshift({ key: `${s.round.id}-${id}`, round: s.round.id, panel: id, amount: p.amount, cashMult: mult, crashAt: null, win, time: Date.now() })
    s.myBets = s.myBets.slice(0, 30)
    event({ type: 'cashout', panel: id, mult, win })
    emit()
  }

  // ── Main loop ──────────────────────────────────────────────
  function tick(now) {
    if (!alive) return

    if (s.phase === 'waiting') {
      if (now - s.phaseStart >= WAIT_MS) startFlight(now)
    } else if (s.phase === 'flying') {
      s.flightSec = (now - s.flightStart) / 1000
      s.mult = multiplierAt(s.flightSec)

      if (s.mult >= s.crashAt) {
        crash(now)
      } else {
        for (const id of [1, 2]) {
          const a = s.auto[id]
          if (a.enabled && s.panels[id].status === 'flying' && s.mult >= a.value) cashOut(id)
        }
        let botsChanged = false
        for (const b of s.bots) {
          if (b.cashMult == null && s.mult >= b.target) {
            b.cashMult = Math.floor(b.target * 100) / 100
            botsChanged = true
          }
        }
        if (botsChanged) emit()
      }
    } else if (s.phase === 'crashed') {
      if (now - s.phaseStart >= CRASH_HOLD_MS) startWaiting(now)
    }

    onFrame({
      phase: s.phase,
      mult: s.mult,
      flightSec: s.flightSec,
      sincePhase: now - s.phaseStart,
      waitLeft: s.phase === 'waiting' ? Math.max(0, WAIT_MS - (now - s.phaseStart)) : 0,
      panels: s.panels,
      now,
    })

    raf = requestAnimationFrame(tick)
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    start() {
      alive = true
      startWaiting(performance.now())
      raf = requestAnimationFrame(tick)
    },

    stop() {
      alive = false
      cancelAnimationFrame(raf)
    },

    /** Bet / cancel / cash out depending on the panel's current status. */
    action(id, rawAmount) {
      const p = s.panels[id]

      if (p.status === 'flying') return cashOut(id)

      if (p.status === 'placed' || p.status === 'queued') {
        s.balance += p.amount
        const wasQueued = p.status === 'queued'
        s.panels[id] = newPanel()
        event({ type: 'toast', kind: 'info', text: wasQueued ? `Queued bet ${id} cancelled` : `Bet ${id} cancelled` })
        return emit()
      }

      const amount = Math.round(Number(rawAmount) * 100) / 100
      if (!Number.isFinite(amount) || amount < 1) {
        return event({ type: 'toast', kind: 'error', text: 'Minimum bet is ₹1.00' })
      }
      if (amount > MAX_BET) {
        return event({ type: 'toast', kind: 'error', text: `Maximum bet is ₹${MAX_BET.toLocaleString('en-IN')}` })
      }
      if (amount > s.balance) {
        return event({ type: 'toast', kind: 'error', text: 'Insufficient balance' })
      }

      s.balance -= amount
      s.panels[id] = { status: s.phase === 'waiting' ? 'placed' : 'queued', amount }
      event({
        type: 'toast',
        kind: 'info',
        text: s.phase === 'waiting' ? `Bet ${id} placed` : `Bet ${id} queued for next round`,
      })
      emit()
    },

    setAuto(id, enabled, value) {
      const v = Number(value)
      s.auto[id] = { enabled, value: Number.isFinite(v) && v >= 1.01 ? v : 2 }
    },

    resetBalance() {
      s.balance = START_BALANCE
      emit()
    },
  }
}
